(function($){
    $(function(){
        $('#rdi-test-api').on('click', function(e){
            e.preventDefault();
            var $res = $('#rdi-test-api-result');
            $res.text('Testando...');

            fetch(rdiAdmin.ajax_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: new URLSearchParams({ action: 'rdi_test_connection', nonce: rdiAdmin.nonce })
            }).then(function(r){
                return r.json();
            }).then(function(data){
                if (data.success) {
                    $res.text('Conexão OK');
                } else {
                    $res.text('Erro: ' + (data.data || 'Resposta inválida'));
                }
            }).catch(function(err){
                $res.text('Erro: ' + err.message);
            });
        });
    });
})(jQuery);
