firebase.initializeApp({
  apiKey: "AIzaSyCvIgYRRmdQkLeWUpe8sjROyFILvBVqEmc",
  authDomain: "financial-ledger-315ae.firebaseapp.com",
  projectId: "financial-ledger-315ae",
  storageBucket: "financial-ledger-315ae.firebasestorage.app",
  messagingSenderId: "1094421632135",
  appId: "1:1094421632135:web:a748ad8579178834d5d422"
});

const db = firebase.firestore();
let currentWorkingMonth = document.getElementById('budget-month').value;
let transactions = [];
let isHistoricalMode = false;
let donutChart, barChart;
let bsModal;

document.addEventListener("DOMContentLoaded", function() {
    bsModal = new bootstrap.Modal(document.getElementById('crudModal'));
    initCharts();
    setupEventListeners();
    loadMonthData(document.getElementById('budget-month').value);
});

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
            document.getElementById('tx-desc-custom').required = false;
            container.innerHTML = `
                <label class="form-label small fw-bold text-muted">Counterparty / Merchant</label>
                <input type="text" id="tx-desc-text" class="form-control form-dark-input" placeholder="e.g. Pack'nSave" required>
            `;
        }
    });

    document.getElementById('transaction-form').addEventListener('submit', function(e) {
        e.preventDefault();
        if (isHistoricalMode) return;

        const type = typeSelect.value;
        const inputAmount = parseFloat(document.getElementById('tx-amount').value) || 0;
        const entryMode = document.getElementById('tx-entry-mode').value;
        const cat = document.getElementById('tx-cat').value;
        let finalDescription = "";

        if (type === 'Income') {
            const dropdownVal = document.getElementById('tx-desc-dropdown').value;
            if (dropdownVal === 'Others') {
                finalDescription = document.getElementById('tx-desc-custom').value.trim() || "Other Income";
            } else {
                finalDescription = dropdownVal;
            }
        } else {
            finalDescription = document.getElementById('tx-desc-text').value.trim();
        }

        let expectedAmount = 0;
        let actualAmount = 0;

        if (entryMode === 'actual') {
            expectedAmount = inputAmount;
            actualAmount = inputAmount;
        } else {
            expectedAmount = inputAmount;
            actualAmount = 0;
        }

        transactions.push({ 
            type, 
            desc: finalDescription, 
            expected: expectedAmount, 
            actual: actualAmount, 
            cat 
        });
        
        saveMonthData();
        
        document.getElementById('tx-amount').value = '';
        if (type === 'Income') {
            document.getElementById('tx-desc-dropdown').value = 'Radius Rimu Park';
            document.getElementById('tx-desc-custom').value = '';
            customContainer.classList.add('d-none');
        } else {
            document.getElementById('tx-desc-text').value = '';
        }
        
        calculateBudget();
    });
}

function handleIncomeDescChange() {
    const customContainer = document.getElementById('custom-desc-container');
    const customInput = document.getElementById('tx-desc-custom');
    if (this.value === 'Others') {
        customContainer.classList.remove('d-none');
        customInput.required = true;
        customInput.focus();
    } else {
        customContainer.classList.add('d-none');
        customInput.required = false;
    }
}

function saveMonthData() {
    if (isHistoricalMode) return;
    db.collection("budget_months").doc(currentWorkingMonth).set({
        ledger: transactions
    })
    .catch((error) => console.error("Cloud save failed: ", error));
}

function loadMonthData(monthName) {
    const historicalBadge = document.getElementById('historical-badge');
    const loggerCard = document.getElementById('logger-card');

    db.collection("budget_archives").doc(monthName).get().then((archiveDoc) => {
        if (archiveDoc.exists) {
            isHistoricalMode = true;
            transactions = archiveDoc.data().ledgerSnapshot || [];
            historicalBadge.classList.remove('d-none');
            loggerCard.classList.add('opacity-50', 'pe-none');
            calculateBudget();
        } else {
            isHistoricalMode = false;
            historicalBadge.classList.add('d-none');
            loggerCard.classList.remove('opacity-50', 'pe-none');

            db.collection("budget_months").doc(monthName).get().then((liveDoc) => {
                if (liveDoc.exists) {
                    transactions = liveDoc.data().ledger || [];
                } else {
                    transactions = [];
                }
                calculateBudget();
            });
        }
    }).catch((error) => console.error("Fetch failed: ", error));
}

function openCrudModal(idx) {
    if (isHistoricalMode) return;
    const item = transactions[idx];
    document.getElementById('edit-idx').value = idx;
    document.getElementById('edit-desc').value = item.desc;
    document.getElementById('edit-expected').value = item.expected;
    document.getElementById('edit-actual').value = item.actual;
    bsModal.show();
}

function commitCrudEdit() {
    const idx = parseInt(document.getElementById('edit-idx').value);
    transactions[idx].desc = document.getElementById('edit-desc').value.trim();
    transactions[idx].expected = parseFloat(document.getElementById('edit-expected').value) || 0;
    transactions[idx].actual = parseFloat(document.getElementById('edit-actual').value) || 0;
    
    bsModal.hide();
    saveMonthData();
    calculateBudget();
}

function deleteCrudRow(idx) {
    if (isHistoricalMode) return;
    if (!confirm("Remove this log item entirely?")) return;
    transactions.splice(idx, 1);
    saveMonthData();
    calculateBudget();
}

function calculateBudget() {
    let actInc = 0, expInc = 0;
    let actExp = 0, expExp = 0;
    let catTotals = {
        "Food & Groceries": { act: 0, exp: 0 },
        "Utilities": { act: 0, exp: 0 },
        "Shopping": { act: 0, exp: 0 },
        "Debts": { act: 0, exp: 0 }
    };

    const incomeBody = document.getElementById('income-log-body');
    const expenseBody = document.getElementById('expense-log-body');
    const subBodies = {
        "Food & Groceries": document.getElementById('sub-body-food'),
        "Utilities": document.getElementById('sub-body-utilities'),
        "Shopping": document.getElementById('sub-body-shopping'),
        "Debts": document.getElementById('sub-body-debts')
    };

    if (incomeBody) incomeBody.innerHTML = '';
    if (expenseBody) expenseBody.innerHTML = '';
    Object.values(subBodies).forEach(el => { if (el) el.innerHTML = ''; });

    transactions.forEach((t, index) => {
        const actionButtons = isHistoricalMode ? `<span class="text-muted small">-</span>` : `
            <div class="d-flex gap-1 justify-content-center">
                <button class="btn btn-xs btn-outline-primary" onclick="openCrudModal(${index})"><i class="bi bi-pencil-square"></i></button>
                <button class="btn btn-xs btn-outline-danger" onclick="deleteCrudRow(${index})"><i class="bi bi-trash"></i></button>
            </div>
        `;

        if (t.type === 'Income') {
            expInc += t.expected;
            actInc += t.actual;
            if (incomeBody) {
                incomeBody.innerHTML += `
                    <tr>
                        <td>${t.desc}</td>
                        <td class="text-end">$${t.expected.toFixed(2)}</td>
                        <td class="text-end fw-bold text-success">$${t.actual.toFixed(2)}</td>
                        <td class="text-center">${actionButtons}</td>
                    </tr>`;
            }
        } else {
            expExp += t.expected;
            actExp += t.actual;
            if (catTotals.hasOwnProperty(t.cat)) {
                catTotals[t.cat].exp += t.expected;
                catTotals[t.cat].act += t.actual;
                if (subBodies[t.cat]) {
                    subBodies[t.cat].innerHTML += `
                        <tr class="small">
                            <td>${t.desc}</td>
                            <td class="text-end text-muted">$${t.expected.toFixed(2)}</td>
                            <td class="text-end fw-bold">$${t.actual.toFixed(2)}</td>
                        </tr>`;
                }
            }
            
            let badgeClass = "bg-secondary";
            if(t.cat === "Food & Groceries") badgeClass = "bg-danger-subtle text-danger";
            if(t.cat === "Utilities") badgeClass = "bg-warning-subtle text-dark";
            if(t.cat === "Shopping") badgeClass = "bg-info-subtle text-info";
            if(t.cat === "Debts") badgeClass = "bg-warning text-dark";

            if (expenseBody) {
                expenseBody.innerHTML += `
                    <tr>
                        <td>${t.desc}</td>
                        <td class="text-end">$${t.expected.toFixed(2)}</td>
                        <td class="text-end fw-bold text-danger">$${t.actual.toFixed(2)}</td>
                        <td class="text-center"><span class="badge ${badgeClass}" style="font-size:0.7rem;">${t.cat.split(' ')[0]}</span></td>
                        <td class="text-center">${actionButtons}</td>
                    </tr>`;
            }
        }
    });

    if(document.getElementById('sum-expected-income')) document.getElementById('sum-expected-income').innerText = `$${expInc.toFixed(2)}`;
    if(document.getElementById('sum-expected-expenses')) document.getElementById('sum-expected-expenses').innerText = `$${expExp.toFixed(2)}`;
    if(document.getElementById('sum-expected-food')) document.getElementById('sum-expected-food').innerText = `$${catTotals["Food & Groceries"].exp.toFixed(2)}`;
    if(document.getElementById('sum-expected-utilities')) document.getElementById('sum-expected-utilities').innerText = `$${catTotals["Utilities"].exp.toFixed(2)}`;
    if(document.getElementById('sum-expected-shopping')) document.getElementById('sum-expected-shopping').innerText = `$${catTotals["Shopping"].exp.toFixed(2)}`;
    if(document.getElementById('sum-expected-debts')) document.getElementById('sum-expected-debts').innerText = `$${catTotals["Debts"].exp.toFixed(2)}`;

    if(document.getElementById('sum-actual-income')) document.getElementById('sum-actual-income').innerText = `$${actInc.toFixed(2)}`;
    if(document.getElementById('sum-actual-expenses')) document.getElementById('sum-actual-expenses').innerText = `$${actExp.toFixed(2)}`;
    if(document.getElementById('sum-actual-food')) document.getElementById('sum-actual-food').innerText = `$${catTotals["Food & Groceries"].act.toFixed(2)}`;
    if(document.getElementById('sum-actual-utilities')) document.getElementById('sum-actual-utilities').innerText = `$${catTotals["Utilities"].act.toFixed(2)}`;
    if(document.getElementById('sum-actual-shopping')) document.getElementById('sum-actual-shopping').innerText = `$${catTotals["Shopping"].act.toFixed(2)}`;
    if(document.getElementById('sum-actual-debts')) document.getElementById('sum-actual-debts').innerText = `$${catTotals["Debts"].act.toFixed(2)}`;

    if(document.getElementById('diff-income')) document.getElementById('diff-income').innerText = `$${(expInc - actInc).toFixed(2)}`;
    if(document.getElementById('diff-expenses')) document.getElementById('diff-expenses').innerText = `$${(expExp - actExp).toFixed(2)}`;
    if(document.getElementById('diff-food')) document.getElementById('diff-food').innerText = `$${(catTotals["Food & Groceries"].exp - catTotals["Food & Groceries"].act).toFixed(2)}`;
    if(document.getElementById('diff-utilities')) document.getElementById('diff-utilities').innerText = `$${(catTotals["Utilities"].exp - catTotals["Utilities"].act).toFixed(2)}`;
    if(document.getElementById('diff-shopping')) document.getElementById('diff-shopping').innerText = `$${(catTotals["Shopping"].exp - catTotals["Shopping"].act).toFixed(2)}`;
    if(document.getElementById('diff-debts')) document.getElementById('diff-debts').innerText = `$${(catTotals["Debts"].exp - catTotals["Debts"].act).toFixed(2)}`;

    let actualNetSavings = actInc - actExp;

    if(document.getElementById('net-savings-spread')) {
        document.getElementById('net-savings-spread').innerText = `$${actualNetSavings.toFixed(2)}`;
        document.getElementById('net-savings-spread').className = actualNetSavings >= 0 ? "text-end text-success" : "text-end text-danger";
    }

    if(document.getElementById('sub-goal-food')) document.getElementById('sub-goal-food').innerText = `$${catTotals["Food & Groceries"].exp.toFixed(2)}`;
    if(document.getElementById('sub-act-food')) document.getElementById('sub-act-food').innerText = `$${catTotals["Food & Groceries"].act.toFixed(2)}`;
    if(document.getElementById('sub-goal-utilities')) document.getElementById('sub-goal-utilities').innerText = `$${catTotals["Utilities"].exp.toFixed(2)}`;
    if(document.getElementById('sub-act-utilities')) document.getElementById('sub-act-utilities').innerText = `$${catTotals["Utilities"].act.toFixed(2)}`;
    if(document.getElementById('sub-goal-shopping')) document.getElementById('sub-goal-shopping').innerText = `$${catTotals["Shopping"].exp.toFixed(2)}`;
    if(document.getElementById('sub-act-shopping')) document.getElementById('sub-act-shopping').innerText = `$${catTotals["Shopping"].act.toFixed(2)}`;
    if(document.getElementById('sub-goal-debts')) document.getElementById('sub-goal-debts').innerText = `$${catTotals["Debts"].exp.toFixed(2)}`;
    if(document.getElementById('sub-act-debts')) document.getElementById('sub-act-debts').innerText = `$${catTotals["Debts"].act.toFixed(2)}`;
    
    updateCharts(catTotals, actInc, actExp, expInc, expExp);
    
    let actualSavings = actInc - actExp;
    let savingsRate = actInc > 0 ? (actualSavings / actInc) * 100 : 0;
    let burnRate = actInc > 0 ? (actExp / actInc) * 100 : 0;

    const heroNum = document.getElementById('savings-hero-number');
    const heroBadge = document.getElementById('savings-hero-badge');
    const insightWrapper = document.getElementById('insight-card-wrapper');
    const analysisText = document.getElementById('savings-analysis-text');
    const runwayBadge = document.getElementById('runway-status-badge');

    if (heroNum && heroBadge && insightWrapper && analysisText && runwayBadge) {
        heroNum.innerText = `$${actualSavings.toFixed(2)}`;
        if (actualSavings >= 0) {
            heroNum.className = "display-4 fw-black my-2 text-success";
            heroBadge.className = "badge bg-success-subtle text-success mx-auto px-3 py-1 rounded-pill font-xs fw-bold";
            heroBadge.innerText = "Surplus Active";
            insightWrapper.className = "card p-3 border-0 shadow-sm h-100 justify-content-between border-surplus-active";
            runwayBadge.innerText = "Accumulating Wealth";
            runwayBadge.className = "text-success fw-bold";
            analysisText.innerText = savingsRate >= 20 ? `Outstanding allocation efficiency! You are currently retaining ${savingsRate.toFixed(1)}% of your income.` : `You maintain a positive cash accumulation structure. You are currently saving ${savingsRate.toFixed(1)}% of total inflows.`;
        } else {
            heroNum.className = "display-4 fw-black my-2 text-danger";
            heroBadge.className = "badge bg-danger-subtle text-danger mx-auto px-3 py-1 rounded-pill font-xs fw-bold";
            heroBadge.innerText = "Deficit Spending";
            insightWrapper.className = "card p-3 border-0 shadow-sm h-100 justify-content-between border-deficit-active";
            runwayBadge.innerText = "Capital Hemorrhage";
            runwayBadge.className = "text-danger fw-bold";
            analysisText.innerText = `Warning: Outflows exceed gross inflow capacity. Your burn rate velocity is tracking at ${burnRate.toFixed(1)}%.`;
        }
    }

    if(document.getElementById('metric-savings-rate')) document.getElementById('metric-savings-rate').innerText = `${savingsRate.toFixed(1)}%`;
    if(document.getElementById('metric-burn-rate')) document.getElementById('metric-burn-rate').innerText = `${burnRate.toFixed(1)}%`;
    if(document.getElementById('metric-retained')) document.getElementById('metric-retained').innerText = `$${actualSavings.toFixed(2)}`;
}

function initCharts() {
    const ctxDonut = document.getElementById('expenseDonutChart').getContext('2d');
    donutChart = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: ['Food & Groceries', 'Utilities', 'Shopping', 'Debts'],
            datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#e57373', '#fff176', '#64b5f6', '#f97316'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const ctxBar = document.getElementById('actualVsGoalChart').getContext('2d');
    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Income', 'Expenses', 'Food', 'Utilities', 'Shopping', 'Debts'],
            datasets: [
                { label: 'Actual', data: [0,0,0,0,0,0], backgroundColor: '#2e7d32' },
                { label: 'Expected', data: [0,0,0,0,0,0], backgroundColor: '#a5d6a7' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

function updateCharts(catTotals, actInc, actExp, expInc, expExp) {
    if (donutChart) {
        donutChart.data.datasets[0].data = [catTotals["Food & Groceries"].act, catTotals["Utilities"].act, catTotals["Shopping"].act, catTotals["Debts"].act];
        donutChart.update();
    }
    if (barChart) {
        barChart.data.datasets[0].data = [actInc, actExp, catTotals["Food & Groceries"].act, catTotals["Utilities"].act, catTotals["Shopping"].act, catTotals["Debts"].act];
        barChart.data.datasets[1].data = [expInc, expExp, catTotals["Food & Groceries"].exp, catTotals["Utilities"].exp, catTotals["Shopping"].exp, catTotals["Debts"].exp];
        barChart.update();
    }
}
