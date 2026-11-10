let apiToken = '';

function wrapTryCatch(f, message_element_id = 'task-error') {
    return async function () {
        document.getElementById(message_element_id).textContent = '';
        try {
            await f();
        } catch (err) {
            document.getElementById(message_element_id).textContent = err.message;
        }
    };
}

async function API(url, method = 'GET', body) {
    let options = { method, headers: {} };

    if( apiToken ) options.headers['Authorization'] = `Bearer ${apiToken}`;

    if( body ) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    let response = await fetch(url, options);
    if( response.status === 204 ) return null;
    let data = await response.json();
    if( !response.ok ) throw new Error(data.error || `HTTP Error: ${response.status}`);
    return data;
}


// ======= АВТОРИЗАЦИЯ ============================================================================
document.getElementById('login-btn').onclick = wrapTryCatch(async () => {
    apiToken = document.getElementById('token-input').value.trim();
    document.getElementById('auth-error').textContent = '';

    const author = await API('/api/author/');
    document.getElementById('author-display').textContent = `Здравствуйте, ${author.fullName} (${author.login})!`;

    document.getElementById('auth-section').hidden = true;
    document.getElementById('main-section').hidden = false;

    await fullRefresh();
}, 'auth-error');



// ======= API ЗАПРОСЫ ============================================================================
//  showedTasks - все записи отображаемые в таблице, key: runId, value: [ {id,ownerLogin,title,done,runId,createdAt}, ...]
let showedTasks = new Map();

async function loadTasksOf(runId) {
    showedTasks.set( runId, await API(`/api/tasks/?runId=${encodeURIComponent(runId)}`) );
}

// возвращает - был ли вызыван fullRenderTable()
async function addTask(t, need_server_call = 1)  {
    if( need_server_call ) t = await API('/api/tasks/', 'POST', { title: t.title, runId: t.runId });

    if( !getFilter(t.runId).checked ) return 0;

    // данный runId отображается - добавляем в таблицу
    showedTasks.   get(t.runId).push(t);
    fullRenderTable();
    return 1;
}

// тут НЕ вызываем fullRenderTable() - так как строка может сама удалиться
async function deleteTask(t, need_server_call = 1) {
    if( need_server_call ) await API(`/api/tasks/${t.id}/`, 'DELETE');

    // Если данный runId отображается - то удаляем из showedTasks объект t
    if( showedTasks.has(t.runId) ) {
        let arr = showedTasks.get(t.runId);
        arr.splice(arr.indexOf(t), 1);  // .indexOf(x) - находит именно этот объект x (имеющий ту же ссылку)
    }
}

// возвращает - был ли вызыван fullRenderTable()
async function editTask(t, newDone, newRunId, newTitle) {
    let oldRunId = t.runId;
    // Object.assign(x, y) - копирует все поля y в существующий x (ссылка на x сохраняется), лишние ключи x не удаляются
    Object.assign( t, await API(`/api/tasks/${t.id}/`, 'PATCH', { done: newDone, title: newTitle, runId: newRunId }) );
    
    if( oldRunId == newRunId ) return 0;

    t.runId = oldRunId;
    deleteTask(t, 0);
    t.runId = newRunId;
    return addTask(t, 0);
}


// ======= КАТЕГОРИИ (checkbox-ы) runId В <fieldset> ==============================================
let fieldset = new Map();  // <runId, checkbox HTML Element>

function createFilter(runId) {
    const label = document.createElement('label');
    label.style.marginRight = '12px';

    const checkbox = document.createElement('input');
    checkbox.type    = 'checkbox';
    checkbox.checked = false;
    checkbox.onchange =  wrapTryCatch(async () => { 
        checkbox.checked ? await loadTasksOf(runId) : showedTasks.delete(runId); 
        fullRenderTable();
    });
    
    label.append(checkbox, ' ' + runId);
    document.getElementById('runid-filters').appendChild(label);

    fieldset.   set(runId, checkbox);
    showedTasks.set(runId, []);
}

// !!! Если фильтр отсутствует - то getFilter его создаст!
function getFilter(runId) {
    if  ( !fieldset.has(runId) ) createFilter(runId);
    return fieldset.get(runId);
}

function deleteFilter(runId) {
    fieldset.      get(runId).parentElement.remove();
    fieldset.   delete(runId);
    showedTasks.delete(runId);
}


async function fullRefresh() {
    const new_runIds = await API('/api/tasks/runids/');

    // удаляем из fieldset устаревшие фильтры
    const new_runIds_set = new Set(new_runIds);
    for(const [runId] of fieldset)
        if( !new_runIds_set.has(runId) ) deleteFilter(runId);

    // заного загружаем строки таблицы
    showedTasks.clear();
    for(const runId of new_runIds) {
        if( getFilter(runId).checked ) await loadTasksOf(runId);
    }
    fullRenderTable();
}


// ======= КНОПКИ =================================================================================
// "Обновить"
document.getElementById('load-btn').onclick = wrapTryCatch(async () => { await fullRefresh(); });

// "Показать все"
document.getElementById('show-all-btn').onclick = wrapTryCatch(async () => {
    // когда все checkboxes включены - будем выключать их
    let valueToSet = 0;

    // сигнатура для Map : map.forEach( (value, key, map) => {...} );
    fieldset.forEach( value => { valueToSet    |= !value.checked } );
    fieldset.forEach( value => { value.checked  =  valueToSet;   } );
    await fullRefresh();
});

// "Добавить задачу"
const InputTitle = document.getElementById('task-title');
const InputRunId = document.getElementById('task-runid');
document.getElementById('add-btn').onclick = wrapTryCatch(async () => {
    await addTask({ title: InputTitle.value.trim(), runId: InputRunId.value.trim() });
    InputTitle.value = '';
    InputRunId.value = '';
});



// ======= РЕНДЕР =================================================================================
const tbody = document.getElementById('task-list');
function fullRenderTable() {
    tbody.innerHTML = '';
    for(const [runId, catalog] of showedTasks) for(const t of catalog) tbody.appendChild(buildLine(t));
}

function buildLine(t, isEditState = 0) {
    // строка сохраняет ссылку на объект t как замыкание
    const tr = document.createElement('tr');

    // Строка может находится в двух режимах: просто текст и редактирование в input
    // flipLine навешивается на .onclick - и в итоге сохраняется контекст с `tr` `t` `isEditState`
    function   flipThisLine() { tr.replaceWith( buildLine(t, !isEditState) ); }
    function deleteThisLine() { tr.remove(); }


    // СТОЛБЕЦ: статус
    const td1      = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type     = 'checkbox';
    checkbox.checked  = !!t.done;
    checkbox.disabled = isEditState;
    td1.appendChild(checkbox);

    // СТОЛБЕЦ: Категория / Задача
    const tdRunId = document.createElement('td');
    const tdTitle = document.createElement('td');
    
    // СТОЛБЕЦ: Действия
    const button1 = document.createElement('button');
    const button2 = document.createElement('button');
    const td4     = document.createElement('td');
    td4.append(button1, button2);

    if( isEditState ) {
        let inputRunId = document.createElement('input'); tdRunId.appendChild(inputRunId); inputRunId.value = t.runId;
        let inputTitle = document.createElement('input'); tdTitle.appendChild(inputTitle); inputTitle.value = t.title;

        button1.textContent = 'Сохранить';
        button1.onclick = wrapTryCatch(async () => {
            // editTask возвращает - был ли вызыван fullRenderTable()
            if( await editTask(t, t.done, inputRunId.value.trim(), inputTitle.value.trim()) ) return;

            // отображается ли новая строка
            if( getFilter(t.runId).checked ) flipThisLine();
            else                           deleteThisLine();
        });
        
        button2.textContent = 'Отмена';
        button2.onclick = flipThisLine;
    } else {
        tdRunId.textContent = t.runId;
        tdTitle.textContent = t.title;
        tdTitle.style.textDecoration = t.done ? 'line-through' : '';

        checkbox.onchange = wrapTryCatch(async () => {
            await editTask(t, checkbox.checked, t.runId, t.title);
            tdTitle.style.textDecoration = t.done ? 'line-through' : '';
        });

        button1.textContent = 'Редактировать';
        button1.onclick = flipThisLine;

        button2.textContent = 'Удалить';
        button2.onclick = wrapTryCatch(async () => {
            await deleteTask(t);
            deleteThisLine();
        });
    }

    tr.append(td1, tdRunId, tdTitle, td4);
    return tr;
}
