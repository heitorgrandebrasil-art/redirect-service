(function(){
    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showNotice(type, message) {
        var notice = byId('rdi-redirects-notice');
        notice.innerHTML = '<div class="notice notice-' + type + ' is-dismissible"><p>' + escapeHtml(message) + '</p></div>';
    }

    function debugMessage(debug) {
        if (!rdiRedirects.debug_enabled || !debug) {
            return '';
        }

        return '\nDebug: ' + JSON.stringify(debug);
    }

    function apiRequest(action, payload) {
        var body = new URLSearchParams(Object.assign({
            action: action,
            nonce: rdiRedirects.nonce
        }, payload || {}));

        return fetch(rdiRedirects.ajax_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: body
        }).then(function(response){
            return response.json().then(function(json){
                if (!response.ok || !json.success) {
                    var message = json && json.data && json.data.message ? json.data.message : 'Erro ao processar solicitação.';
                    message += debugMessage(json && json.data ? json.data.debug : null);
                    throw new Error(message);
                }

                return json.data;
            });
        });
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }

        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleString();
    }

    function formatCount(value) {
        var number = Number(value || 0);
        return Number.isFinite(number) ? number.toLocaleString() : '0';
    }

    function redirectUrl(shortPath) {
        var cleanPath = String(shortPath || '').replace(/^\/+/, '');
        return String(rdiRedirects.redirect_base_url || '').replace(/\/+$/, '') + '/' + encodeURIComponent(cleanPath);
    }

    function renderRows(redirects) {
        var tbody = document.querySelector('#rdi-redirects-table tbody');

        if (!redirects.length) {
            tbody.innerHTML = '<tr><td colspan="7">Nenhum redirect encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = redirects.map(function(redirect){
            var publicUrl = redirectUrl(redirect.short_path);
            return [
                '<tr data-id="' + escapeHtml(redirect.id) + '">',
                '<td><code>' + escapeHtml(redirect.short_path) + '</code></td>',
                '<td><a href="' + escapeHtml(publicUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(publicUrl) + '</a></td>',
                '<td><input type="url" class="regular-text rdi-edit-target-url" value="' + escapeHtml(redirect.target_url) + '" required /></td>',
                '<td><input type="checkbox" class="rdi-edit-active" value="1"' + (redirect.active ? ' checked' : '') + ' /></td>',
                '<td>' + escapeHtml(formatCount(redirect.click_count)) + '</td>',
                '<td>' + escapeHtml(formatDate(redirect.updated_at || redirect.created_at)) + '</td>',
                '<td>',
                '<button type="button" class="button button-primary rdi-update-redirect">Salvar</button> ',
                '<button type="button" class="button rdi-delete-redirect">Excluir</button>',
                '</td>',
                '</tr>'
            ].join('');
        }).join('');
    }

    function loadRedirects() {
        var tbody = document.querySelector('#rdi-redirects-table tbody');
        tbody.innerHTML = '<tr><td colspan="7">Carregando redirects...</td></tr>';

        apiRequest('rdi_list_redirects')
            .then(function(data){
                renderRows(Array.isArray(data) ? data : []);
            })
            .catch(function(error){
                tbody.innerHTML = '<tr><td colspan="7">Erro ao carregar redirects.</td></tr>';
                showNotice('error', error.message);
            });
    }

    function renderAnalytics(analytics) {
        var container = byId('rdi-redirects-analytics');
        var rows = Array.isArray(analytics.per_short_path) ? analytics.per_short_path : [];

        if (!rows.length) {
            container.innerHTML = '<p><strong>Total clicks:</strong> ' + escapeHtml(formatCount(analytics.total_clicks)) + '</p><p>Nenhum click registrado ainda.</p>';
            return;
        }

        container.innerHTML = [
            '<p><strong>Total clicks:</strong> ' + escapeHtml(formatCount(analytics.total_clicks)) + '</p>',
            '<table class="widefat striped">',
            '<thead><tr><th scope="col">Short path</th><th scope="col">Clicks</th><th scope="col">Último click</th></tr></thead>',
            '<tbody>',
            rows.map(function(row){
                return [
                    '<tr>',
                    '<td><code>' + escapeHtml(row.short_path) + '</code></td>',
                    '<td>' + escapeHtml(formatCount(row.click_count)) + '</td>',
                    '<td>' + escapeHtml(formatDate(row.last_clicked_at)) + '</td>',
                    '</tr>'
                ].join('');
            }).join(''),
            '</tbody></table>'
        ].join('');
    }

    function loadAnalytics() {
        var container = byId('rdi-redirects-analytics');
        container.innerHTML = '<p>Carregando analytics...</p>';

        apiRequest('rdi_get_redirect_analytics')
            .then(function(data){
                renderAnalytics(data || { total_clicks: 0, per_short_path: [] });
            })
            .catch(function(error){
                container.innerHTML = '<p>Erro ao carregar analytics.</p>';
                showNotice('error', error.message);
            });
    }

    function refreshData() {
        loadRedirects();
        loadAnalytics();
    }

    function createRedirect(event) {
        event.preventDefault();

        var form = event.currentTarget;
        var submit = form.querySelector('[type="submit"]');

        if (!form.reportValidity()) {
            return;
        }

        submit.disabled = true;

        apiRequest('rdi_create_redirect', {
            short_path: form.short_path.value.trim(),
            target_url: form.target_url.value.trim(),
            active: form.active.checked ? '1' : '0'
        }).then(function(){
            form.reset();
            form.active.checked = true;
            showNotice('success', 'Redirect criado.');
            refreshData();
        }).catch(function(error){
            showNotice('error', error.message);
        }).finally(function(){
            submit.disabled = false;
        });
    }

    function updateRedirect(row) {
        var id = row.getAttribute('data-id');
        var target = row.querySelector('.rdi-edit-target-url');
        var active = row.querySelector('.rdi-edit-active');
        var button = row.querySelector('.rdi-update-redirect');

        if (!target.reportValidity()) {
            return;
        }

        button.disabled = true;

        apiRequest('rdi_update_redirect', {
            id: id,
            target_url: target.value.trim(),
            active: active.checked ? '1' : '0'
        }).then(function(){
            showNotice('success', 'Redirect atualizado.');
            refreshData();
        }).catch(function(error){
            showNotice('error', error.message);
        }).finally(function(){
            button.disabled = false;
        });
    }

    function deleteRedirect(row) {
        var id = row.getAttribute('data-id');
        var button = row.querySelector('.rdi-delete-redirect');

        if (!window.confirm('Excluir este redirect?')) {
            return;
        }

        button.disabled = true;

        apiRequest('rdi_delete_redirect', { id: id })
            .then(function(){
                showNotice('success', 'Redirect excluído.');
                refreshData();
            })
            .catch(function(error){
                showNotice('error', error.message);
            })
            .finally(function(){
                button.disabled = false;
            });
    }

    document.addEventListener('DOMContentLoaded', function(){
        var form = byId('rdi-create-redirect-form');
        var table = byId('rdi-redirects-table');

        if (!form || !table) {
            return;
        }

        form.addEventListener('submit', createRedirect);
        table.addEventListener('click', function(event){
            var row = event.target.closest('tr[data-id]');

            if (!row) {
                return;
            }

            if (event.target.classList.contains('rdi-update-redirect')) {
                updateRedirect(row);
            }

            if (event.target.classList.contains('rdi-delete-redirect')) {
                deleteRedirect(row);
            }
        });

        refreshData();
    });
})();
