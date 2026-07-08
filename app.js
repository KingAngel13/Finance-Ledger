// Local Engine Registrations
let currentWorkingMonth = document.getElementById('budget-month').value;
let allMonthsData = JSON.parse(localStorage.getItem('budget_system_all_months')) || {};
let historyArchives = JSON.parse(localStorage.getItem('budget_history_archives')) || [];

let transactions = [];
let isHistoricalMode = false;
let donutChart, barChart;
let bsModal;

// Vintage Live Equation Ticker Properties
let calcExpressionStr = ""; 
let isCalcResetOnNextKey = false;
let calcHistoryTape = [];

document.addEventListener("DOMContentLoaded", function() {
    bsModal = new bootstrap.Modal(document.getElementById('crudModal'));
    initCharts();
    loadMonthData(document.getElementById('budget-month').value);
    setupEventListeners();
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
                <label class="form-label small fw-bold text-muted">Source Asset Identity</label>
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
        const amountTyped = parseFloat(document.getElementById('tx-amount').value) || 0;
        const entryMode = document.getElementById('tx-entry-mode').value;
        const cat = document.getElementById('tx-cat').value;
        let finalDescription = "";

        if (type === 'Income') {
            const dropdownVal = document.getElementById('tx-desc-dropdown').value;
            if (dropdownVal === 'Others') {
                finalDescription = document.getElementById('tx-desc-custom').value.trim() || "Other Income Streams";
            } else {
                finalDescription = dropdownVal;
            }
        } else {
            finalDescription = document.getElementById('tx-desc-text').value.trim();
        }

        let expectedValue = amountTyped;
        let actualValue = 0;
        if (entryMode === 'actual') {
            actualValue = amountTyped; 
        }

        transactions.push({ 
            type, 
            desc: finalDescription, 
            expected: expectedValue, 
            actual: actualValue, 
            cat 
        });
        
        saveMonthData();
        
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-entry-mode').value = 'expected';
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

// ADVANCED LEDGER MATULA ENGINE CONTROLLER
function pressCalcKey(key) {
    const display = document.getElementById('calc-screen');
    const operators = ['+', '-', '*', '/'];

    if (key === 'C') {
        calcExpressionStr = "";
        display.innerText = "0";
        isCalcResetOnNextKey = false;
        return;
    }

    if (key === '=') {
        if (calcExpressionStr === "") return;
        
        let cleanExpr = calcExpressionStr.trim();
        if (operators.includes(cleanExpr.slice(-1))) {
            cleanExpr = cleanExpr.slice(0, -1).trim();
        }

        try {
            let outcome = Function(`"use strict"; return (${cleanExpr})`)();
            let displayExpr = cleanExpr.replace(/\*/g, '×').replace(/\//g, '÷');
            
            // Format tape row to cleanly separate the equation from the huge readable result balance span
            pushCalcHistoryTape(`${displayExpr} = <span>$${outcome.toFixed(2)}</span>`);
            
            calcExpressionStr = outcome.toString();
            display.innerText = calcExpressionStr;
            isCalcResetOnNextKey = true; 
        } catch (e) {
            display.innerText = "ERROR";
            calcExpressionStr = "";
        }
        return;
    }

    if (operators.includes(key)) {
        if (calcExpressionStr === "") {
            if (key === '-') { 
                calcExpressionStr = "-";
                display.innerText = calcExpressionStr;
            }
            return;
        }

        let lastChar = calcExpressionStr.trim().slice(-1);
        if (operators.includes(lastChar)) {
            calcExpressionStr = calcExpressionStr.trim().slice(0, -1) + " " + key + " ";
        } else {
            calcExpressionStr = calcExpressionStr.trim() + " " + key + " ";
        }
        
        display.innerText = calcExpressionStr.replace(/\*/g, '×').replace(/\//g, '÷');
        isCalcResetOnNextKey = false;
    } else {
        if (isCalcResetOnNextKey) {
            calcExpressionStr = "";
            isCalcResetOnNextKey = false;
        }

        if (calcExpressionStr === "0" && key !== '.') calcExpressionStr = "";
        calcExpressionStr += key;
        display.innerText = calcExpressionStr.replace(/\*/g, '×').replace(/\//g, '÷');
    }
}

function pushCalcHistoryTape(lineItem) {
    calcHistoryTape.push(lineItem);
    if (calcHistoryTape.length > 5) calcHistoryTape.shift();
    renderCalcTape();
}

function renderCalcTape() {
    const tapeBox = document.getElementById('calc-tape');
    if(calcHistoryTape.length === 0) {
        tapeBox.innerHTML = `<div class="tape-row empty-tape-msg">Tape Empty</div>`;
        return;
    }
    tapeBox.innerHTML = calcHistoryTape.map(row => `<div class="tape-row">${row}</div>`).join('');
    tapeBox.scrollTop = tapeBox.scrollHeight;
}

function clearCalcTape() {
    calcHistoryTape = [];
    renderCalcTape();
}

function saveMonthData() {
    if (isHistoricalMode) return;
    allMonthsData[currentWorkingMonth] = transactions;
    localStorage.setItem('budget_system_all_months', JSON.stringify(allMonthsData));
}

function triggerManualSaveFeedback() {
    if (isHistoricalMode) return;
    saveMonthData();
    alert(`📁 System Notice: Ledger metrics for ${currentWorkingMonth} locked into native storage!`);
}

function clearCurrentMonthLogs() {
    if (isHistoricalMode) return;
    if (!confirm(`⚠️ CRITICAL WARNING: Flush current ledger logs inside ${currentWorkingMonth}?`)) return;
    transactions = [];
    saveMonthData();
    calculateBudget();
}

function loadMonthData(monthName) {
    const historicalRecord = historyArchives.find(r => r.month === monthName);
    const deleteArchiveBtn = document.getElementById('delete-archive-btn');
    const historicalBadge = document.getElementById('historical-badge');
    const loggerCard = document.getElementById('logger-card');
    const archiveBtn = document.getElementById('archive-btn');
    const manualSaveBtn = document.getElementById('manual-save-btn');
    const clearMonthBtn = document.getElementById('clear-month-btn');

    if (historicalRecord) {
        isHistoricalMode = true;
        transactions = historicalRecord.ledgerSnapshot;
        deleteArchiveBtn.classList.remove('d-none');
        historicalBadge.classList.remove('d-none');
        loggerCard.classList.add('opacity-50', 'pe-none');
        archiveBtn.classList.add('d-none');
        if (manualSaveBtn) manualSaveBtn.classList.add('d-none');
        if (clearMonthBtn) clearMonthBtn.classList.add('d-none');
    } else {
        isHistoricalMode = false;
        transactions = allMonthsData[monthName] || [];
        deleteArchiveBtn.classList.add('d-none');
        historicalBadge.classList.add('d-none');
        loggerCard.classList.remove('opacity-50', 'pe-none');
        archiveBtn.classList.remove('d-none');
        if (manualSaveBtn) manualSaveBtn.classList.remove('d-none');
        if (clearMonthBtn) clearMonthBtn.classList.remove('d-none');
    }
    calculateBudget();
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
    transactions[idx].expected = parseFloat(document.getElementById('edit-expected').value) || 0;
    transactions[idx].actual = parseFloat(document.getElementById('edit-actual').value) || 0;
    bsModal.hide();
    saveMonthData();
    calculateBudget();
}

function deleteCrudRow(idx) {
    if (isHistoricalMode) return;
    if (!confirm("Exterminate this row component from system memory?")) return;
    transactions.splice(idx, 1);
    saveMonthData();
    calculateBudget();
}

function calculateBudget() {
    let actInc = 0, expInc = 0;
    let actExp = 0, expExp = 0;
    let catTotals = { "Food & Groceries": { act: 0, exp: 0 }, "Utilities": { act: 0, exp: 0 }, "Shopping": { act: 0, exp: 0 }, "Savings": { act: 0, exp: 0 } };

    const incomeBody = document.getElementById('income-log-body');
    const expenseBody = document.getElementById('expense-log-body');
    const subBodies = {
        "Food & Groceries": document.getElementById('sub-body-food'),
        "Utilities": document.getElementById('sub-body-utilities'),
        "Shopping": document.getElementById('sub-body-shopping'),
        "Savings": document.getElementById('sub-body-savings')
    };

    incomeBody.innerHTML = '';
    expenseBody.innerHTML = '';
    Object.values(subBodies).forEach(el => el.innerHTML = '');

    transactions.forEach((t, index) => {
        const actionButtons = isHistoricalMode ? `<span class="text-muted small">-</span>` : `
            <div class="d-flex gap-1 justify-content-center">
                <button class="btn btn-xs btn-outline-secondary" onclick="openCrudModal(${index})"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-xs btn-outline-danger" onclick="deleteCrudRow(${index})"><i class="bi bi-x-lg"></i></button>
            </div>
        `;

        if (t.type === 'Income') {
            expInc += t.expected;
            actInc += t.actual;
            incomeBody.innerHTML += `
                <tr>
                    <td class="fw-medium">${t.desc}</td>
                    <td class="text-end text-muted">$${t.expected.toFixed(2)}</td>
                    <td class="text-end fw-bold text-success">$${t.actual.toFixed(2)}</td>
                    <td class="text-center">${actionButtons}</td>
                </tr>`;
        } else {
            expExp += t.expected;
            actExp += t.actual;
            if (catTotals.hasOwnProperty(t.cat)) {
                catTotals[t.cat].exp += t.expected;
                catTotals[t.cat].act += t.actual;
                subBodies[t.cat].innerHTML += `
                    <tr class="small">
                        <td>${t.desc}</td>
                        <td class="text-end text-muted">$${t.expected.toFixed(2)}</td>
                        <td class="text-end fw-bold">$${t.actual.toFixed(2)}</td>
                    </tr>`;
            }
            
            let badgeClass = "bg-secondary";
            if(t.cat === "Food & Groceries") badgeClass = "bg-danger text-white";
            if(t.cat === "Utilities") badgeClass = "bg-warning text-dark";
            if(t.cat === "Shopping") badgeClass = "bg-info text-white";
            if(t.cat === "Savings") badgeClass = "bg-success text-white";

            expenseBody.innerHTML += `
                <tr>
                    <td class="fw-medium">${t.desc}</td>
                    <td class="text-end text-muted">$${t.expected.toFixed(2)}</td>
                    <td class="text-end fw-bold text-danger">$${t.actual.toFixed(2)}</td>
                    <td class="text-center"><span class="badge ${badgeClass}" style="font-size:0.65rem; padding: 3px 6px;">${t.cat.split(' ')[0]}</span></td>
                    <td class="text-center">${actionButtons}</td>
                </tr>`;
        }
    });

    Object.keys(catTotals).forEach(cKey => {
        const idSafe = cKey.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');
        document.getElementById(`sub-goal-${idSafe === 'food-groceries' ? 'food' : idSafe}`).innerText = `$${catTotals[cKey].exp.toFixed(2)}`;
        document.getElementById(`sub-act-${idSafe === 'food-groceries' ? 'food' : idSafe}`).innerText = `$${catTotals[cKey].act.toFixed(2)}`;
    });

    document.getElementById('sum-actual-income').innerText = `$${actInc.toFixed(2)}`;
    document.getElementById('sum-expected-income').innerText = `$${expInc.toFixed(2)}`;
    document.getElementById('sum-actual-expenses').innerText = `$${actExp.toFixed(2)}`;
    document.getElementById('sum-expected-expenses').innerText = `$${expExp.toFixed(2)}`;

    document.getElementById('sum-actual-food').innerText = `$${catTotals["Food & Groceries"].act.toFixed(2)}`;
    document.getElementById('sum-expected-food').innerText = `$${catTotals["Food & Groceries"].exp.toFixed(2)}`;
    document.getElementById('sum-actual-utilities').innerText = `$${catTotals["Utilities"].act.toFixed(2)}`;
    document.getElementById('sum-expected-utilities').innerText = `$${catTotals["Utilities"].exp.toFixed(2)}`;
    document.getElementById('sum-actual-shopping').innerText = `$${catTotals["Shopping"].act.toFixed(2)}`;
    document.getElementById('sum-expected-shopping').innerText = `$${catTotals["Shopping"].exp.toFixed(2)}`;
    document.getElementById('sum-actual-savings').innerText = `$${catTotals["Savings"].act.toFixed(2)}`;
    document.getElementById('sum-expected-savings').innerText = `$${catTotals["Savings"].exp.toFixed(2)}`;

    document.getElementById('pct-income').innerText = expInc ? `${Math.round((actInc / expInc) * 100)}%` : '0%';
    document.getElementById('pct-expenses').innerText = expExp ? `${Math.round((actExp / expExp) * 100)}%` : '0%';
    document.getElementById('pct-food').innerText = catTotals["Food & Groceries"].exp ? `${Math.round((catTotals["Food & Groceries"].act / catTotals["Food & Groceries"].exp) * 100)}%` : '0%';
    document.getElementById('pct-utilities').innerText = catTotals["Utilities"].exp ? `${Math.round((catTotals["Utilities"].act / catTotals["Utilities"].exp) * 100)}%` : '0%';
    document.getElementById('pct-shopping').innerText = catTotals["Shopping"].exp ? `${Math.round((catTotals["Shopping"].act / catTotals["Shopping"].exp) * 100)}%` : '0%';
    document.getElementById('pct-savings').innerText = catTotals["Savings"].exp ? `${Math.round((catTotals["Savings"].act / catTotals["Savings"].exp) * 100)}%` : '0%';

    document.getElementById('net-actual').innerText = `$${(actInc - actExp).toFixed(2)}`;
    document.getElementById('net-expected').innerText = `$${(expInc - expExp).toFixed(2)}`;

    updateCharts(catTotals, actInc, actExp, expInc, expExp);
}

function archiveCurrentMonth() {
    if (isHistoricalMode) return;
    if(transactions.length === 0) return alert("Empty ledger matrix cannot populate archive files!");
    if(!confirm(`Commit historical sealing lock for ${currentWorkingMonth}?`)) return;

    historyArchives = historyArchives.filter(r => r.month !== currentWorkingMonth);
    historyArchives.push({ month: currentWorkingMonth, ledgerSnapshot: [...transactions] });
    localStorage.setItem('budget_history_archives', JSON.stringify(historyArchives));

    alert(`Archived.`);
    loadMonthData(currentWorkingMonth);
}

function deleteSelectedArchiveRecord() {
    if (!isHistoricalMode) return;
    if (!confirm(`Unseal and delete archive records for ${currentWorkingMonth}?`)) return;

    historyArchives = historyArchives.filter(r => r.month !== currentWorkingMonth);
    localStorage.setItem('budget_history_archives', JSON.stringify(historyArchives));
    loadMonthData(currentWorkingMonth);
}

function initCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

    const ctxDonut = document.getElementById('expenseDonutChart').getContext('2d');
    donutChart = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: ['Food', 'Utilities', 'Shopping', 'Savings'],
            datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#ef4444', '#eab308', '#3b82f6', '#22c55e'], borderStrokeColor: '#1e293b', borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const ctxBar = document.getElementById('actualVsGoalChart').getContext('2d');
    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Inc', 'Exp', 'Food', 'Util', 'Shop', 'Save'],
            datasets: [
                { label: 'Act', data: [0,0,0,0,0,0], backgroundColor: '#22c55e' },
                { label: 'Exp', data: [0,0,0,0,0,0], backgroundColor: '#475569' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } } }
    });
}

function updateCharts(catTotals, actInc, actExp, expInc, expExp) {
    donutChart.data.datasets[0].data = [catTotals["Food & Groceries"].act, catTotals["Utilities"].act, catTotals["Shopping"].act, catTotals["Savings"].act];
    donutChart.update();

    barChart.data.datasets[0].data = [actInc, actExp, catTotals["Food & Groceries"].act, catTotals["Utilities"].act, catTotals["Shopping"].act, catTotals["Savings"].act];
    barChart.data.datasets[1].data = [expInc, expExp, catTotals["Food & Groceries"].exp, catTotals["Utilities"].exp, catTotals["Shopping"].exp, catTotals["Savings"].exp];
    barChart.update();
}