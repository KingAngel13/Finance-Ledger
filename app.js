import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCvIgYRRmdQkLeWUpe8sjROyFILvBVqEmc",
    authDomain: "financial-ledger-315ae.firebaseapp.com",
    projectId: "financial-ledger-315ae",
    storageBucket: "financial-ledger-315ae.firebasestorage.app",
    messagingSenderId: "1094421632135",
    appId: "1:1094421632135:web:a748ad8579178834d5d422"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentWorkingMonth = document.getElementById('budget-month').value;
let allMonthsData = {};
let historyArchives = [];
let transactions = [];
let isHistoricalMode = false;
let donutChart, barChart;
let bsModal;

document.addEventListener("DOMContentLoaded", async function() {
    bsModal = new bootstrap.Modal(document.getElementById('crudModal'));
    initCharts();
    await fetchFirebaseData();
    loadMonthData(document.getElementById('budget-month').value);
    setupEventListeners();
});

async function fetchFirebaseData() {
    try {
        const docRef = doc(db, "budget_data", "user_ledger");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            allMonthsData = data.months || {};
            historyArchives = data.archives || [];
        }
    } catch (e) { console.error("Error fetching data: ", e); }
}

async function saveToFirebase() {
    if (isHistoricalMode) return;
    try {
        const docRef = doc(db, "budget_data", "user_ledger");
        await setDoc(docRef, { months: allMonthsData, archives: historyArchives });
    } catch (e) { console.error("Error saving: ", e); }
}

function setupEventListeners() {
    const typeSelect = document.getElementById('tx-type');
    const container = document.getElementById('desc-field-container');
    const customContainer = document.getElementById('custom-desc-container');
    const monthSelect = document.getElementById('budget-month');

    monthSelect.addEventListener('change', function() {
        currentWorkingMonth = this.value;
        loadMonthData(this.value);
    });

    typeSelect.addEventListener('change', function() {
        const catSelect = document.getElementById('tx-cat');
        if (this.value === 'Income') {
            catSelect.disabled = true;
            catSelect.value = "";
            container.innerHTML = `
                <label class="form-label small fw-bold text-muted">Description</label>
                <select id="tx-desc-dropdown" class="form-select form-dark-input" required>
                    <option value="Radius Rimu Park">Radius Rimu Park</option>
                    <option value="St. Pierre's Sushi">St. Pierre's Sushi</option>
                    <option value="McDonald's Kamo">McDonald's Kamo</option>
                    <option value="Radius Potter Home">Radius Potter Home</option>
                    <option value="Others">Others</option>
                </select>
            `;
            document.getElementById('tx-desc-dropdown').addEventListener('change', handleIncomeDescChange);
        } else {
            catSelect.disabled = false;
            catSelect.value = "Food & Groceries";
            customContainer.classList.add('d-none');
            container.innerHTML = `
                <label class="form-label small fw-bold text-muted">Counterparty / Merchant</label>
                <input type="text" id="tx-desc-text" class="form-control form-dark-input" placeholder="e.g. Pack'nSave" required>
            `;
        }
    });

    document.getElementById('transaction-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        if (isHistoricalMode) return;

        const inputAmount = parseFloat(document.getElementById('tx-amount').value) || 0;
        const entryMode = document.getElementById('tx-entry-mode').value;
        const type = typeSelect.value;
        
        let finalDescription = (type === 'Income') ? 
            (document.getElementById('tx-desc-dropdown').value === 'Others' ? document.getElementById('tx-desc-custom').value : document.getElementById('tx-desc-dropdown').value) : 
            document.getElementById('tx-desc-text').value;

        transactions.push({ type, desc: finalDescription, expected: inputAmount, actual: (entryMode === 'actual' ? inputAmount : 0), cat: document.getElementById('tx-cat').value });
        
        allMonthsData[currentWorkingMonth] = transactions;
        await saveToFirebase();
        document.getElementById('tx-amount').value = '';
        calculateBudget();
    });
}

function handleIncomeDescChange() {
    const customContainer = document.getElementById('custom-desc-container');
    const customInput = document.getElementById('tx-desc-custom');
    customContainer.classList.toggle('d-none', this.value !== 'Others');
    customInput.required = (this.value === 'Others');
}

async function triggerManualSaveFeedback() {
    if (isHistoricalMode) return;
    await saveToFirebase();
    alert("Data saved to cloud.");
}

async function clearCurrentMonthLogs() {
    if (isHistoricalMode || !confirm("Clear logs for this month?")) return;
    transactions = [];
    allMonthsData[currentWorkingMonth] = transactions;
    await saveToFirebase();
    calculateBudget();
}

function loadMonthData(monthName) {
    const historicalRecord = historyArchives.find(r => r.month === monthName);
    isHistoricalMode = !!historicalRecord;
    transactions = isHistoricalMode ? historicalRecord.ledgerSnapshot : (allMonthsData[monthName] || []);
    
    document.getElementById('delete-archive-btn').classList.toggle('d-none', !isHistoricalMode);
    document.getElementById('historical-badge').classList.toggle('d-none', !isHistoricalMode);
    document.getElementById('logger-card').classList.toggle('opacity-50', isHistoricalMode);
    document.getElementById('archive-btn').classList.toggle('d-none', isHistoricalMode);
    calculateBudget();
}

async function commitCrudEdit() {
    const idx = parseInt(document.getElementById('edit-idx').value);
    transactions[idx].desc = document.getElementById('edit-desc').value;
    transactions[idx].expected = parseFloat(document.getElementById('edit-expected').value);
    transactions[idx].actual = parseFloat(document.getElementById('edit-actual').value);
    bsModal.hide();
    allMonthsData[currentWorkingMonth] = transactions;
    await saveToFirebase();
    calculateBudget();
}

async function deleteCrudRow(idx) {
    if (isHistoricalMode || !confirm("Remove this log?")) return;
    transactions.splice(idx, 1);
    allMonthsData[currentWorkingMonth] = transactions;
    await saveToFirebase();
    calculateBudget();
}

async function archiveCurrentMonth() {
    if (isHistoricalMode || transactions.length === 0 || !confirm("Archive this month?")) return;
    historyArchives = historyArchives.filter(r => r.month !== currentWorkingMonth);
    historyArchives.push({ month: currentWorkingMonth, ledgerSnapshot: [...transactions] });
    await saveToFirebase();
    loadMonthData(currentWorkingMonth);
}

async function deleteSelectedArchiveRecord() {
    if (!isHistoricalMode || !confirm("Unlock this archive?")) return;
    historyArchives = historyArchives.filter(r => r.month !== currentWorkingMonth);
    await saveToFirebase();
    loadMonthData(currentWorkingMonth);
}

function calculateBudget() {
    let actInc = 0, expExp = 0, actExp = 0;
    let catTotals = { "Food & Groceries": { act: 0, exp: 0 }, "Utilities": { act: 0, exp: 0 }, "Shopping": { act: 0, exp: 0 }, "Debts": { act: 0, exp: 0 } };
    
    transactions.forEach(t => {
        if (t.type === 'Income') actInc += t.actual;
        else { 
            expExp += t.expected; actExp += t.actual;
            if (catTotals[t.cat]) { catTotals[t.cat].exp += t.expected; catTotals[t.cat].act += t.actual; }
        }
    });

    document.getElementById('sum-actual-income').innerText = `$${actInc.toFixed(2)}`;
    document.getElementById('sum-actual-expenses').innerText = `$${actExp.toFixed(2)}`;
    document.getElementById('net-savings-spread').innerText = `$${(actInc - actExp).toFixed(2)}`;
    
    updateCharts(catTotals);
}

function initCharts() {
    donutChart = new Chart(document.getElementById('expenseDonutChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Food', 'Utilities', 'Shopping', 'Debts'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#e57373', '#fff176', '#64b5f6', '#f97316'] }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function updateCharts(catTotals) {
    donutChart.data.datasets[0].data = [catTotals["Food & Groceries"].act, catTotals["Utilities"].act, catTotals["Shopping"].act, catTotals["Debts"].act];
    donutChart.update();
}

function pressCalcKey(key) {
    const screen = document.getElementById('calc-screen');
    if ((key >= '0' && key <= '9') || key === '.') {
        calcCurrent = (calcCurrent === '0' && key !== '.') ? key : calcCurrent + key;
        screen.innerText = calcCurrent;
    } else if (key === 'C') {
        calcCurrent = '0'; screen.innerText = '0';
    }
}
let calcCurrent = '0';

function clearCalcTape() { document.getElementById('calc-tape').innerHTML = '<div class="tape-row empty-tape-msg">Tape Empty</div>'; }
