// =============================================
// CONFIG - Apna backend URL yahan daalo
// =============================================
const API_BASE_URL = "https://your-library-backend.railway.app"; // Railway/Render URL
// Local testing ke liye: const API_BASE_URL = "http://localhost:5000";

// =============================================
// STATE
// =============================================
let allBooks = [];
let allMembers = [];
let allIssues = [];
let darkMode = localStorage.getItem("darkMode") === "true";
let currentUser = null;

// =============================================
// API HELPER
// =============================================
async function apiCall(endpoint, method = "GET", body = null) {
  const token = localStorage.getItem("authToken");
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE_URL}${endpoint}`, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "API error");
  }
  return data;
}

// =============================================
// AUTH
// =============================================
async function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const btn = document.getElementById("loginBtn");
  const btnText = document.getElementById("loginBtnText");
  const spinner = document.getElementById("loginSpinner");
  const errorEl = document.getElementById("loginError");

  if (!email || !password) {
    showLoginError("Email aur password dono chahiye");
    return;
  }

  btn.disabled = true;
  btnText.textContent = "Signing in...";
  spinner.classList.remove("hidden");
  errorEl.classList.add("hidden");

  try {
    const data = await apiCall("/api/auth/login", "POST", { email, password });
    localStorage.setItem("authToken", data.token);
    localStorage.setItem("adminUser", JSON.stringify({ name: data.name, email: data.email }));
    currentUser = data;
    showApp();
  } catch (err) {
    showLoginError(err.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = "Sign In";
    spinner.classList.add("hidden");
  }
}

function showLoginError(msg) {
  const el = document.getElementById("loginError");
  el.textContent = "❌ " + msg;
  el.classList.remove("hidden");
}

function togglePassword() {
  const input = document.getElementById("loginPassword");
  input.type = input.type === "password" ? "text" : "password";
}

async function checkAuth() {
  const token = localStorage.getItem("authToken");
  if (!token) return showLogin();

  try {
    currentUser = await apiCall("/api/auth/me");
    showApp();
  } catch {
    localStorage.removeItem("authToken");
    showLogin();
  }
}

function showLogin() {
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showApp() {
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  const user = currentUser || JSON.parse(localStorage.getItem("adminUser") || "{}");
  document.getElementById("adminNameDisplay").textContent = user.name || "Admin";
  document.getElementById("adminEmailDisplay").textContent = user.email || "";
  document.getElementById("profileEmail").textContent = user.email || "—";
  document.getElementById("profileName").textContent = user.name || "—";
  document.getElementById("profileAvatar").textContent = (user.name || "A")[0].toUpperCase();

  applyDarkMode();
  loadAll();
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("authToken");
  localStorage.removeItem("adminUser");
  showLogin();
});

// =============================================
// NAVIGATION
// =============================================
document.querySelectorAll(".menu-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    navigateTo(btn.dataset.section);
  });
});

function navigateTo(sectionId) {
  document.querySelectorAll(".menu-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.section === sectionId);
  });

  const titles = {
    dashboard: "Dashboard",
    books: "Books Management",
    members: "Members Management",
    issue: "Issue / Return",
    reports: "Reports",
    profile: "Admin Profile",
  };
  document.getElementById("sectionTitle").textContent = titles[sectionId] || sectionId;

  document.querySelectorAll(".content-section").forEach((s) => s.classList.remove("active-section"));
  document.getElementById(sectionId)?.classList.add("active-section");

  if (sectionId === "reports") renderReports();
  if (sectionId === "issue") renderIssueTable(allIssues.filter((i) => i.status === "Issued"));

  // Mobile sidebar close
  document.getElementById("sidebar").classList.remove("open");
}

window.navigateTo = navigateTo;

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

// =============================================
// LOAD ALL DATA
// =============================================
async function loadAll() {
  try {
    const [books, members, issues] = await Promise.all([
      apiCall("/api/books"),
      apiCall("/api/members"),
      apiCall("/api/issues"),
    ]);

    allBooks = books;
    allMembers = members;
    allIssues = issues;

    renderBooks();
    renderMembers();
    renderIssueTable(issues.filter((i) => i.status === "Issued"));
    updateDashboard();
    populateIssueSelects();
    checkOverdue();
  } catch (err) {
    showAlert("Data load karne me problem: " + err.message, "error");
  }
}

// =============================================
// DASHBOARD
// =============================================
function updateDashboard() {
  const totalBooksCount = allBooks.length;
  const availCount = allBooks.reduce((s, b) => s + (b.available || 0), 0);
  const issuedCount = allIssues.filter((i) => i.status === "Issued").length;
  const totalFine = allIssues.reduce((s, i) => s + (i.finePaid || 0), 0);
  const overdue = allIssues.filter((i) => i.status === "Issued" && (i.liveFine || 0) > 0).length;

  document.getElementById("totalBooks").textContent = totalBooksCount;
  document.getElementById("availableBooks").textContent = availCount;
  document.getElementById("totalMembers").textContent = allMembers.length;
  document.getElementById("issuedBooks").textContent = issuedCount;
  document.getElementById("totalFine").textContent = "₹" + totalFine;
  document.getElementById("overdueCount").textContent = overdue;
}

function checkOverdue() {
  const overdue = allIssues.filter((i) => i.status === "Issued" && (i.liveFine || 0) > 0);
  if (overdue.length > 0) {
    showAlert(`⚠️ ${overdue.length} book(s) overdue hain!`, "warning");
  }
}

// =============================================
// BOOKS
// =============================================
function renderBooks(books = allBooks) {
  const tbody = document.getElementById("booksTable");
  if (!books.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Koi book nahi mili</td></tr>`;
    return;
  }
  tbody.innerHTML = books.map((b) => `
    <tr>
      <td><strong>${esc(b.title)}</strong></td>
      <td>${esc(b.author)}</td>
      <td><code>${esc(b.isbn)}</code></td>
      <td><span class="tag">${esc(b.category)}</span></td>
      <td>${b.copies}</td>
      <td><span class="${b.available > 0 ? 'avail-badge' : 'unavail-badge'}">${b.available}</span></td>
      <td>
        <button class="action-btn edit-btn" onclick="editBook('${b._id}')">✏️ Edit</button>
        <button class="action-btn delete-btn" onclick="deleteBook('${b._id}')">🗑 Delete</button>
      </td>
    </tr>
  `).join("");
}

document.getElementById("bookSearch").addEventListener("input", (e) => {
  const v = e.target.value.toLowerCase();
  renderBooks(allBooks.filter((b) =>
    [b.title, b.author, b.isbn, b.category].some((f) => (f || "").toLowerCase().includes(v))
  ));
});

async function handleSaveBook() {
  const id = document.getElementById("bookId").value;
  const payload = {
    title: document.getElementById("bookTitle").value.trim(),
    author: document.getElementById("bookAuthor").value.trim(),
    isbn: document.getElementById("bookISBN").value.trim(),
    category: document.getElementById("bookCategory").value.trim(),
    copies: parseInt(document.getElementById("bookCopies").value),
  };

  if (!payload.title || !payload.author || !payload.isbn || !payload.category || isNaN(payload.copies)) {
    return showAlert("Sabhi fields sahi se bharo", "error");
  }

  try {
    if (id) {
      const updated = await apiCall(`/api/books/${id}`, "PUT", payload);
      allBooks = allBooks.map((b) => (b._id === id ? updated : b));
      showAlert("Book update ho gayi!", "success");
    } else {
      const newBook = await apiCall("/api/books", "POST", payload);
      allBooks.unshift(newBook);
      showAlert("Book add ho gayi!", "success");
    }
    closeModal("bookModal");
    renderBooks();
    updateDashboard();
    populateIssueSelects();
  } catch (err) {
    showAlert(err.message, "error");
  }
}

function editBook(id) {
  const b = allBooks.find((b) => b._id === id);
  if (!b) return;
  document.getElementById("bookId").value = b._id;
  document.getElementById("bookTitle").value = b.title;
  document.getElementById("bookAuthor").value = b.author;
  document.getElementById("bookISBN").value = b.isbn;
  document.getElementById("bookCategory").value = b.category;
  document.getElementById("bookCopies").value = b.copies;
  document.getElementById("bookModalTitle").textContent = "Edit Book";
  openModal("bookModal");
}

async function deleteBook(id) {
  if (!confirm("Kya aap is book ko delete karna chahte hain?")) return;
  try {
    await apiCall(`/api/books/${id}`, "DELETE");
    allBooks = allBooks.filter((b) => b._id !== id);
    renderBooks();
    updateDashboard();
    showAlert("Book delete ho gayi", "success");
  } catch (err) {
    showAlert(err.message, "error");
  }
}

// =============================================
// MEMBERS
// =============================================
function renderMembers(members = allMembers) {
  const tbody = document.getElementById("membersTable");
  if (!members.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">Koi member nahi mila</td></tr>`;
    return;
  }
  tbody.innerHTML = members.map((m) => `
    <tr>
      <td><strong>${esc(m.name)}</strong></td>
      <td>${esc(m.email)}</td>
      <td>${esc(m.phone)}</td>
      <td>${esc(m.joinDate)}</td>
      <td>
        <button class="action-btn edit-btn" onclick="editMember('${m._id}')">✏️ Edit</button>
        <button class="action-btn delete-btn" onclick="deleteMember('${m._id}')">🗑 Delete</button>
      </td>
    </tr>
  `).join("");
}

document.getElementById("memberSearch").addEventListener("input", (e) => {
  const v = e.target.value.toLowerCase();
  renderMembers(allMembers.filter((m) =>
    [m.name, m.email, m.phone].some((f) => (f || "").toLowerCase().includes(v))
  ));
});

async function handleSaveMember() {
  const id = document.getElementById("memberId").value;
  const payload = {
    name: document.getElementById("memberName").value.trim(),
    email: document.getElementById("memberEmail").value.trim(),
    phone: document.getElementById("memberPhone").value.trim(),
  };

  if (!payload.name || !payload.email || !payload.phone) {
    return showAlert("Sabhi fields bharo", "error");
  }

  try {
    if (id) {
      const updated = await apiCall(`/api/members/${id}`, "PUT", payload);
      allMembers = allMembers.map((m) => (m._id === id ? updated : m));
      showAlert("Member update ho gaya!", "success");
    } else {
      const newMember = await apiCall("/api/members", "POST", payload);
      allMembers.unshift(newMember);
      showAlert("Member add ho gaya!", "success");
    }
    closeModal("memberModal");
    renderMembers();
    updateDashboard();
    populateIssueSelects();
  } catch (err) {
    showAlert(err.message, "error");
  }
}

function editMember(id) {
  const m = allMembers.find((m) => m._id === id);
  if (!m) return;
  document.getElementById("memberId").value = m._id;
  document.getElementById("memberName").value = m.name;
  document.getElementById("memberEmail").value = m.email;
  document.getElementById("memberPhone").value = m.phone;
  document.getElementById("memberModalTitle").textContent = "Edit Member";
  openModal("memberModal");
}

async function deleteMember(id) {
  if (!confirm("Kya aap is member ko delete karna chahte hain?")) return;
  try {
    await apiCall(`/api/members/${id}`, "DELETE");
    allMembers = allMembers.filter((m) => m._id !== id);
    renderMembers();
    updateDashboard();
    showAlert("Member delete ho gaya", "success");
  } catch (err) {
    showAlert(err.message, "error");
  }
}

// =============================================
// ISSUE / RETURN
// =============================================
function populateIssueSelects() {
  const bookSel = document.getElementById("issueBook");
  const memberSel = document.getElementById("issueMember");

  bookSel.innerHTML = `<option value="">-- Book Select Karo --</option>` +
    allBooks.filter((b) => b.available > 0).map((b) =>
      `<option value="${b._id}">${esc(b.title)} (${b.available} available)</option>`
    ).join("");

  memberSel.innerHTML = `<option value="">-- Member Select Karo --</option>` +
    allMembers.map((m) =>
      `<option value="${m._id}">${esc(m.name)}</option>`
    ).join("");

  document.getElementById("issueDate").value = new Date().toISOString().split("T")[0];
}

async function handleIssueBook() {
  const bookId = document.getElementById("issueBook").value;
  const memberId = document.getElementById("issueMember").value;
  const issueDate = document.getElementById("issueDate").value;

  if (!bookId || !memberId || !issueDate) {
    return showAlert("Book, member aur date select karo", "error");
  }

  try {
    const newIssue = await apiCall("/api/issues", "POST", { bookId, memberId, issueDate });
    allIssues.unshift(newIssue);

    // Book available count update karo
    allBooks = allBooks.map((b) =>
      b._id === bookId ? { ...b, available: b.available - 1 } : b
    );

    renderIssueTable(allIssues.filter((i) => i.status === "Issued"));
    updateDashboard();
    populateIssueSelects();
    showAlert("Book issue ho gayi!", "success");
  } catch (err) {
    showAlert(err.message, "error");
  }
}

function renderIssueTable(issues) {
  const tbody = document.getElementById("issueTable");
  if (!issues.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Koi issued book nahi</td></tr>`;
    return;
  }
  tbody.innerHTML = issues.map((item) => {
    const fine = item.liveFine || 0;
    const isOverdue = fine > 0;
    return `
      <tr>
        <td><strong>${esc(item.bookTitle)}</strong></td>
        <td>${esc(item.memberName)}</td>
        <td>${esc(item.issueDate)}</td>
        <td class="${isOverdue ? 'overdue-text' : ''}">${esc(item.dueDate)}</td>
        <td>${fine > 0 ? `<span class="fine-badge">₹${fine}</span>` : `<span class="paid-badge">₹0</span>`}</td>
        <td><span class="status-badge ${item.status === 'Issued' ? 'status-issued' : 'status-returned'}">${item.status}</span></td>
        <td>
          ${item.status === "Issued" ? `
            <button class="action-btn return-btn" onclick="returnBook('${item._id}')">↩ Return</button>
            <button class="action-btn edit-btn" onclick="editFine('${item._id}')">✏️ Fine</button>
          ` : "Returned"}
        </td>
      </tr>
    `;
  }).join("");
}

async function returnBook(id) {
  const issue = allIssues.find((i) => i._id === id);
  if (!issue) return;

  const fine = issue.liveFine || 0;
  const confirm_msg = fine > 0
    ? `Late return fine: ₹${fine}\nKya wapas karna hai?`
    : "Book return karna hai?";

  if (!confirm(confirm_msg)) return;

  try {
    const updated = await apiCall(`/api/issues/${id}/return`, "PUT");
    allIssues = allIssues.map((i) => (i._id === id ? updated : i));

    allBooks = allBooks.map((b) =>
      b._id === issue.bookId ? { ...b, available: b.available + 1 } : b
    );

    renderIssueTable(allIssues.filter((i) => i.status === "Issued"));
    updateDashboard();
    populateIssueSelects();
    showAlert("Book return ho gayi!" + (fine > 0 ? ` Fine: ₹${fine}` : ""), "success");
  } catch (err) {
    showAlert(err.message, "error");
  }
}

async function editFine(id) {
  const issue = allIssues.find((i) => i._id === id);
  if (!issue) return;

  const currentFine = issue.liveFine || 0;
  const newFine = prompt("Naya fine amount daalo:", currentFine);
  if (newFine === null) return;

  const fineVal = parseInt(newFine);
  if (isNaN(fineVal) || fineVal < 0) {
    return showAlert("Valid fine amount daalo", "error");
  }

  try {
    await apiCall(`/api/issues/${id}/fine`, "PUT", { fine: fineVal });
    allIssues = allIssues.map((i) =>
      i._id === id ? { ...i, liveFine: fineVal, finePaid: fineVal } : i
    );
    renderIssueTable(allIssues.filter((i) => i.status === "Issued"));
    showAlert("Fine update ho gaya!", "success");
  } catch (err) {
    showAlert(err.message, "error");
  }
}

// =============================================
// REPORTS
// =============================================
function renderReports() {
  const totalIssued = allIssues.length;
  const totalReturned = allIssues.filter((i) => i.status === "Returned").length;
  const fineCollected = allIssues.reduce((s, i) => s + (i.finePaid || 0), 0);
  const overdue = allIssues.filter((i) => i.status === "Issued" && (i.liveFine || 0) > 0).length;

  document.getElementById("reportStats").innerHTML = `
    <div class="stat-card"><div class="stat-icon">📚</div><div><h3>Total Books</h3><p>${allBooks.length}</p></div></div>
    <div class="stat-card"><div class="stat-icon">👥</div><div><h3>Total Members</h3><p>${allMembers.length}</p></div></div>
    <div class="stat-card"><div class="stat-icon">📤</div><div><h3>Total Issued</h3><p>${totalIssued}</p></div></div>
    <div class="stat-card"><div class="stat-icon">📥</div><div><h3>Total Returned</h3><p>${totalReturned}</p></div></div>
    <div class="stat-card"><div class="stat-icon">💰</div><div><h3>Fine Collected</h3><p>₹${fineCollected}</p></div></div>
    <div class="stat-card overdue-card"><div class="stat-icon">⚠️</div><div><h3>Overdue Books</h3><p>${overdue}</p></div></div>
  `;

  const tbody = document.getElementById("reportsTable");
  if (!allIssues.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Koi data nahi</td></tr>`;
    return;
  }
  tbody.innerHTML = allIssues.map((item) => {
    const fine = item.liveFine !== undefined ? item.liveFine : (item.finePaid || 0);
    return `
      <tr>
        <td>${esc(item.bookTitle)}</td>
        <td>${esc(item.memberName)}</td>
        <td>${esc(item.issueDate)}</td>
        <td class="${fine > 0 && item.status === 'Issued' ? 'overdue-text' : ''}">${esc(item.dueDate)}</td>
        <td>${fine > 0 ? `<span class="fine-badge">₹${fine}</span>` : `<span class="paid-badge">₹0</span>`}</td>
        <td><span class="status-badge ${item.status === 'Issued' ? 'status-issued' : 'status-returned'}">${item.status}</span></td>
      </tr>
    `;
  }).join("");
}

// =============================================
// EXPORT
// =============================================
function exportPDF() {
  const win = window.open("", "_blank");
  if (!win) return showAlert("Popup blocked! Allow popups.", "error");

  const fineTotal = allIssues.reduce((s, i) => s + (i.finePaid || 0), 0);
  win.document.write(`
    <html><head><title>Library Report</title>
    <style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{border:1px solid #ccc;padding:10px;text-align:left}h1{color:#1e3a5f}</style></head>
    <body>
    <h1>📚 Library Management Report</h1>
    <p><strong>Total Books:</strong> ${allBooks.length}</p>
    <p><strong>Total Members:</strong> ${allMembers.length}</p>
    <p><strong>Total Issued:</strong> ${allIssues.length}</p>
    <p><strong>Fine Collected:</strong> ₹${fineTotal}</p>
    <table><tr><th>Book</th><th>Member</th><th>Issue Date</th><th>Due Date</th><th>Fine</th><th>Status</th></tr>
    ${allIssues.map((i) => {
      const fine = i.liveFine !== undefined ? i.liveFine : (i.finePaid || 0);
      return `<tr><td>${esc(i.bookTitle)}</td><td>${esc(i.memberName)}</td><td>${i.issueDate}</td><td>${i.dueDate}</td><td>₹${fine}</td><td>${i.status}</td></tr>`;
    }).join("")}
    </table></body></html>
  `);
  win.document.close();
  win.print();
}

function exportCSV() {
  let csv = "Book,Member,Issue Date,Due Date,Fine,Status\n";
  allIssues.forEach((i) => {
    const fine = i.liveFine !== undefined ? i.liveFine : (i.finePaid || 0);
    csv += `"${i.bookTitle}","${i.memberName}","${i.issueDate}","${i.dueDate}","₹${fine}","${i.status}"\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "library_report.csv";
  link.click();
}

// =============================================
// MODAL HELPERS
// =============================================
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  // Reset forms
  if (id === "bookModal") {
    ["bookId", "bookTitle", "bookAuthor", "bookISBN", "bookCategory", "bookCopies"].forEach((f) => {
      document.getElementById(f).value = "";
    });
    document.getElementById("bookModalTitle").textContent = "Add Book";
  }
  if (id === "memberModal") {
    ["memberId", "memberName", "memberEmail", "memberPhone"].forEach((f) => {
      document.getElementById(f).value = "";
    });
    document.getElementById("memberModalTitle").textContent = "Add Member";
  }
}

// Close modal on backdrop click
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal(modal.id);
  });
});

// =============================================
// ALERT
// =============================================
function showAlert(msg, type = "info") {
  const el = document.getElementById("globalAlert");
  el.textContent = msg;
  el.className = `alert alert-${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

// =============================================
// DARK MODE
// =============================================
document.getElementById("darkModeToggle").addEventListener("click", () => {
  darkMode = !darkMode;
  localStorage.setItem("darkMode", darkMode);
  applyDarkMode();
});

function applyDarkMode() {
  document.body.classList.toggle("dark-mode", darkMode);
  document.getElementById("darkModeToggle").textContent = darkMode ? "☀️ Light Mode" : "🌙 Dark Mode";
}

// =============================================
// UTILITY
// =============================================
function esc(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Enter key login support
document.getElementById("loginPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

// =============================================
// INIT
// =============================================
applyDarkMode();
checkAuth();
