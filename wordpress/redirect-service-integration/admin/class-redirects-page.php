<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class RDI_Redirects_Page {
    const NONCE_ACTION = 'rdi_redirects_nonce';

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_scripts' ) );
        add_action( 'wp_ajax_rdi_list_redirects', array( __CLASS__, 'ajax_list_redirects' ) );
        add_action( 'wp_ajax_rdi_create_redirect', array( __CLASS__, 'ajax_create_redirect' ) );
        add_action( 'wp_ajax_rdi_update_redirect', array( __CLASS__, 'ajax_update_redirect' ) );
        add_action( 'wp_ajax_rdi_delete_redirect', array( __CLASS__, 'ajax_delete_redirect' ) );
        add_action( 'wp_ajax_rdi_get_redirect_analytics', array( __CLASS__, 'ajax_get_analytics' ) );
    }

    public static function add_menu() {
        add_management_page(
            'Redirects',
            'Redirects',
            'manage_options',
            'rdi-redirects',
            array( __CLASS__, 'render_page' )
        );
    }

    public static function enqueue_scripts( $hook ) {
        if ( 'tools_page_rdi-redirects' !== $hook ) {
            return;
        }

        wp_enqueue_script(
            'rdi-redirects',
            plugin_dir_url( __FILE__ ) . 'js/redirects.js',
            array(),
            '0.1.0',
            true
        );

        wp_localize_script(
            'rdi-redirects',
            'rdiRedirects',
            array(
                'ajax_url'          => admin_url( 'admin-ajax.php' ),
                'nonce'             => wp_create_nonce( self::NONCE_ACTION ),
                'redirect_base_url' => self::get_redirect_base_url(),
                'debug_enabled'     => self::debug_enabled(),
            )
        );
    }

    public static function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( 'Sem permissão' );
        }
        ?>
        <div class="wrap">
            <h1>Redirects</h1>
            <div id="rdi-redirects-notice"></div>

            <h2>Criar redirect</h2>
            <form id="rdi-create-redirect-form">
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <label for="rdi-short-path">Short path</label>
                            </th>
                            <td>
                                <input id="rdi-short-path" name="short_path" type="text" class="regular-text" required minlength="4" maxlength="128" />
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="rdi-target-url">Target URL</label>
                            </th>
                            <td>
                                <input id="rdi-target-url" name="target_url" type="url" class="regular-text" required />
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">Active</th>
                            <td>
                                <label>
                                    <input name="active" type="checkbox" value="1" checked />
                                    Enabled
                                </label>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button( 'Criar redirect', 'primary', 'submit', false ); ?>
            </form>

            <hr />

            <h2>Redirects existentes</h2>
            <table class="widefat striped" id="rdi-redirects-table">
                <thead>
                    <tr>
                        <th scope="col">Short path</th>
                        <th scope="col">Redirect URL</th>
                        <th scope="col">Target URL</th>
                        <th scope="col">Active</th>
                        <th scope="col">Clicks</th>
                        <th scope="col">Atualizado</th>
                        <th scope="col">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="7">Carregando redirects...</td>
                    </tr>
                </tbody>
            </table>

            <h2>Analytics</h2>
            <div id="rdi-redirects-analytics">
                <p>Carregando analytics...</p>
            </div>
        </div>
        <?php
    }

    public static function ajax_list_redirects() {
        self::verify_request();
        self::ensure_service_key_available();

        $service = new RDI_Redirect_Service( self::api_client() );
        $res = $service->list_redirects();
        self::send_api_result( $res );
    }

    public static function ajax_get_analytics() {
        self::verify_request();
        self::ensure_service_key_available();

        $service = new RDI_Redirect_Service( self::api_client() );
        $res = $service->get_analytics();
        self::send_api_result( $res );
    }

    public static function ajax_create_redirect() {
        self::verify_request();
        self::ensure_service_key_available();

        $payload = self::redirect_payload_from_request( true );
        if ( is_wp_error( $payload ) ) {
            wp_send_json_error( self::error_payload( $payload ), 400 );
        }

        $service = new RDI_Redirect_Service( self::api_client() );
        $res = $service->create_redirect( $payload );
        self::send_api_result( $res, 201 );
    }

    public static function ajax_update_redirect() {
        self::verify_request();
        self::ensure_service_key_available();

        $id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
        if ( ! $id ) {
            wp_send_json_error( array( 'message' => 'Redirect inválido.' ), 400 );
        }

        $payload = self::redirect_payload_from_request( false );
        if ( is_wp_error( $payload ) ) {
            wp_send_json_error( self::error_payload( $payload ), 400 );
        }

        $service = new RDI_Redirect_Service( self::api_client() );
        $res = $service->update_redirect( $id, $payload );
        self::send_api_result( $res );
    }

    public static function ajax_delete_redirect() {
        self::verify_request();
        self::ensure_service_key_available();

        $id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
        if ( ! $id ) {
            wp_send_json_error( array( 'message' => 'Redirect inválido.' ), 400 );
        }

        $service = new RDI_Redirect_Service( self::api_client() );
        $res = $service->delete_redirect( $id );
        self::send_api_result( $res );
    }

    private static function verify_request() {
        check_ajax_referer( self::NONCE_ACTION, 'nonce' );

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( array( 'message' => 'Sem permissão.' ), 403 );
        }
    }

    private static function api_client() {
        return RDI_Settings_Page::api_client();
    }

    private static function get_redirect_base_url() {
        return RDI_Settings_Page::get_public_base_url() . '/r';
    }

    private static function ensure_service_key_available() {
        $diagnostics = RDI_Settings_Page::get_public_service_key_diagnostics();

        if ( empty( $diagnostics['final_length'] ) ) {
            $payload = array( 'message' => 'Internal service key is empty before the Redirects API request.' );
            wp_send_json_error( self::with_debug( $payload, $diagnostics ), 500 );
        }
    }

    private static function redirect_payload_from_request( $include_short_path ) {
        $target_url = isset( $_POST['target_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['target_url'] ) ) ) : '';

        if ( '' === $target_url ) {
            return new WP_Error( 'rdi_missing_target_url', 'Target URL é obrigatório.' );
        }

        if ( ! filter_var( $target_url, FILTER_VALIDATE_URL ) ) {
            return new WP_Error( 'rdi_invalid_target_url', 'Target URL inválido.' );
        }

        $payload = array(
            'target_url' => $target_url,
            'active'     => isset( $_POST['active'] ) && '1' === sanitize_text_field( wp_unslash( $_POST['active'] ) ),
        );

        if ( $include_short_path ) {
            $short_path = isset( $_POST['short_path'] ) ? sanitize_text_field( trim( wp_unslash( $_POST['short_path'] ) ) ) : '';

            if ( '' === $short_path ) {
                return new WP_Error( 'rdi_missing_short_path', 'Short path é obrigatório.' );
            }

            if ( strlen( $short_path ) < 4 || strlen( $short_path ) > 128 ) {
                return new WP_Error( 'rdi_invalid_short_path', 'Short path deve ter entre 4 e 128 caracteres.' );
            }

            $payload['short_path'] = $short_path;
        }

        return $payload;
    }

    private static function send_api_result( $res, $success_status = 200 ) {
        if ( is_wp_error( $res ) ) {
            $status = 500;
            $data = $res->get_error_data();

            if ( is_array( $data ) && isset( $data['status'] ) ) {
                $status = absint( $data['status'] );
            }

            wp_send_json_error( self::error_payload( $res ), $status ? $status : 500 );
        }

        if ( is_array( $res ) && array_key_exists( 'data', $res ) ) {
            wp_send_json_success( $res['data'], $success_status );
        }

        wp_send_json_success( $res, $success_status );
    }

    private static function error_payload( WP_Error $error ) {
        $payload = array(
            'message' => $error->get_error_message(),
            'code'    => $error->get_error_code(),
        );

        if ( 'rdi_http_error' === $error->get_error_code() ) {
            $payload = self::with_debug( $payload, array(
                'service_key' => RDI_Settings_Page::get_public_service_key_diagnostics(),
                'api_client'  => self::api_client()->get_debug_info(),
            ) );
        }

        return $payload;
    }

    private static function with_debug( $payload, $debug ) {
        if ( self::debug_enabled() ) {
            $payload['debug'] = $debug;
        }

        return $payload;
    }

    private static function debug_enabled() {
        if ( defined( 'RDI_DEBUG' ) ) {
            return (bool) RDI_DEBUG;
        }

        $value = getenv( 'RDI_DEBUG' );
        return in_array( strtolower( (string) $value ), array( '1', 'true', 'yes', 'on' ), true );
    }
}
