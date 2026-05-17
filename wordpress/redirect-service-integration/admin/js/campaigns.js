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
        byId('rdi-campaigns-notice').innerHTML = '<div class="notice notice-' + type + ' is-dismissible"><p>' + escapeHtml(message) + '</p></div>';
    }

    function apiRequest(action, payload) {
        var body = new URLSearchParams(Object.assign({
            action: action,
            nonce: rdiCampaigns.nonce
        }, payload || {}));

        return fetch(rdiCampaigns.ajax_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: body
        }).then(function(response){
            return response.text().then(function(text){
                var json;
                try {
                    json = JSON.parse(text);
                } catch (error) {
                    throw new Error('Resposta AJAX não-JSON: ' + text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240));
                }

                if (!response.ok || !json.success) {
                    var message = json && json.data && json.data.message ? json.data.message : 'Erro ao processar solicitação.';
                    if (rdiCampaigns.debug_enabled && json && json.data && json.data.debug) {
                        message += '\nDebug: ' + JSON.stringify(json.data.debug);
                    }
                    throw new Error(message);
                }

                return json.data;
            });
        });
    }

    function formatCount(value) {
        var number = Number(value || 0);
        return Number.isFinite(number) ? number.toLocaleString() : '0';
    }

    function redirectUrl(shortPath) {
        var cleanPath = String(shortPath || '').replace(/^\/+/, '');
        return String(rdiCampaigns.redirect_base_url || '').replace(/\/+$/, '') + '/' + encodeURIComponent(cleanPath);
    }

    function platformText(campaign) {
        var parts = [];
        if (campaign.platform) {
            parts.push(campaign.platform);
        }
        if (campaign.original_video_url) {
            parts.push('<a href="' + escapeHtml(campaign.original_video_url) + '" target="_blank" rel="noopener noreferrer">Original video</a>');
        }
        return parts.join(' · ');
    }

    function productRows(products) {
        if (!products.length) {
            return '<tr><td colspan="5">Nenhum product link ainda.</td></tr>';
        }

        return products.map(function(product){
            var publicUrl = redirectUrl(product.short_path);
            return [
                '<tr>',
                '<td><strong>' + escapeHtml(product.position || '') + '</strong></td>',
                '<td>' + escapeHtml(product.title) + '</td>',
                '<td><a href="' + escapeHtml(publicUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(publicUrl) + '</a></td>',
                '<td>' + escapeHtml(formatCount(product.click_count)) + '</td>',
                '<td><a href="' + escapeHtml(product.affiliate_url) + '" target="_blank" rel="noopener noreferrer">Affiliate URL</a></td>',
                '</tr>'
            ].join('');
        }).join('');
    }

    function productForm(campaignId) {
        return [
            '<form class="rdi-campaign-product-form" data-video-id="' + escapeHtml(campaignId) + '">',
            '<select name="position" required>',
            '<option value="">Position</option>',
            '<option value="top1">top1</option>',
            '<option value="top2">top2</option>',
            '<option value="top3">top3</option>',
            '<option value="top4">top4</option>',
            '<option value="top5">top5</option>',
            '</select> ',
            '<input name="title" type="text" placeholder="Product title" required /> ',
            '<input name="affiliate_url" type="url" placeholder="Affiliate URL" required class="regular-text" /> ',
            '<input name="short_path" type="text" placeholder="short_path optional" /> ',
            '<button type="submit" class="button">Add product</button>',
            '</form>'
        ].join('');
    }

    function renderCampaigns(campaigns) {
        var container = byId('rdi-campaigns-list');

        if (!campaigns.length) {
            container.innerHTML = '<p>Nenhuma campaign encontrada.</p>';
            return;
        }

        container.innerHTML = campaigns.map(function(campaign){
            var products = Array.isArray(campaign.products) ? campaign.products : [];
            return [
                '<section class="rdi-campaign" style="margin: 0 0 24px;">',
                '<h3 style="margin-bottom:4px;">' + escapeHtml(campaign.title) + ' <span style="font-weight:400;">(' + escapeHtml(formatCount(campaign.total_clicks)) + ' clicks)</span></h3>',
                '<p style="margin-top:0;">' + platformText(campaign) + '</p>',
                campaign.notes ? '<p>' + escapeHtml(campaign.notes) + '</p>' : '',
                '<table class="widefat striped">',
                '<thead><tr><th>Position</th><th>Product</th><th>Redirect URL</th><th>Clicks</th><th>Target</th></tr></thead>',
                '<tbody>' + productRows(products) + '</tbody>',
                '</table>',
                '<div style="margin-top:10px;">' + productForm(campaign.id) + '</div>',
                '</section>'
            ].join('');
        }).join('');
    }

    function loadCampaigns() {
        var container = byId('rdi-campaigns-list');
        container.innerHTML = '<p>Carregando campaigns...</p>';

        apiRequest('rdi_list_campaigns')
            .then(function(data){
                renderCampaigns(Array.isArray(data) ? data : []);
            })
            .catch(function(error){
                container.innerHTML = '<p>Erro ao carregar campaigns.</p>';
                showNotice('error', error.message);
            });
    }

    function createCampaign(event) {
        event.preventDefault();

        var form = event.currentTarget;
        var submit = form.querySelector('[type="submit"]');

        if (!form.reportValidity()) {
            return;
        }

        submit.disabled = true;

        apiRequest('rdi_create_campaign', {
            title: form.title.value.trim(),
            platform: form.platform.value.trim(),
            original_video_url: form.original_video_url.value.trim(),
            notes: form.notes.value.trim()
        }).then(function(){
            form.reset();
            showNotice('success', 'Campaign criada.');
            loadCampaigns();
        }).catch(function(error){
            showNotice('error', error.message);
        }).finally(function(){
            submit.disabled = false;
        });
    }

    function createProduct(event) {
        event.preventDefault();

        var form = event.target.closest('.rdi-campaign-product-form');
        if (!form) {
            return;
        }

        var submit = form.querySelector('[type="submit"]');
        if (!form.reportValidity()) {
            return;
        }

        submit.disabled = true;

        apiRequest('rdi_create_campaign_product', {
            video_id: form.getAttribute('data-video-id'),
            position: form.position.value,
            title: form.title.value.trim(),
            affiliate_url: form.affiliate_url.value.trim(),
            short_path: form.short_path.value.trim()
        }).then(function(){
            showNotice('success', 'Product link criado.');
            loadCampaigns();
        }).catch(function(error){
            showNotice('error', error.message);
        }).finally(function(){
            submit.disabled = false;
        });
    }

    document.addEventListener('DOMContentLoaded', function(){
        var form = byId('rdi-create-campaign-form');
        var list = byId('rdi-campaigns-list');

        if (!form || !list) {
            return;
        }

        form.addEventListener('submit', createCampaign);
        list.addEventListener('submit', createProduct);
        loadCampaigns();
    });
})();
