<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class RDI_Campaigns_Page {
    const NONCE_ACTION = 'rdi_campaigns_nonce';

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_scripts' ) );
        add_action( 'wp_ajax_rdi_list_campaigns', array( __CLASS__, 'ajax_list_campaigns' ) );
        add_action( 'wp_ajax_rdi_create_campaign', array( __CLASS__, 'ajax_create_campaign' ) );
        add_action( 'wp_ajax_rdi_create_campaign_product', array( __CLASS__, 'ajax_create_campaign_product' ) );
    }

    public static function add_menu() {
        add_management_page(
            'Videos/Campaigns',
            'Videos/Campaigns',
            'manage_options',
            'rdi-campaigns',
            array( __CLASS__, 'render_page' )
        );
    }

    public static function enqueue_scripts( $hook ) {
        if ( 'tools_page_rdi-campaigns' !== $hook ) {
            return;
        }

        wp_enqueue_script(
            'rdi-campaigns',
            plugin_dir_url( __FILE__ ) . 'js/campaigns.js',
            array(),
            '0.1.0',
            true
        );

        wp_localize_script(
            'rdi-campaigns',
            'rdiCampaigns',
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
            <h1>Videos/Campaigns</h1>
            <div id="rdi-campaigns-notice"></div>

            <h2>Criar campaign</h2>
            <form id="rdi-create-campaign-form">
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row"><label for="rdi-campaign-title">Title</label></th>
                            <td><input id="rdi-campaign-title" name="title" type="text" class="regular-text" required minlength="3" maxlength="255" /></td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="rdi-campaign-platform">Platform</label></th>
                            <td><input id="rdi-campaign-platform" name="platform" type="text" class="regular-text" required maxlength="128" /></td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="rdi-campaign-original-url">Original video URL</label></th>
                            <td><input id="rdi-campaign-original-url" name="original_video_url" type="url" class="regular-text" required /></td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="rdi-campaign-notes">Notes</label></th>
                            <td><textarea id="rdi-campaign-notes" name="notes" class="large-text" rows="3"></textarea></td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button( 'Criar campaign', 'primary', 'submit', false ); ?>
            </form>

            <hr />

            <h2>Campaigns</h2>
            <div id="rdi-campaigns-list">
                <p>Carregando campaigns...</p>
            </div>
        </div>
        <?php
    }

    public static function ajax_list_campaigns() {
        try {
            self::verify_request();
            self::ensure_service_key_available();

            $service = new RDI_Video_Service( self::api_client() );
            $videos = self::api_data( $service->list_videos() );

            if ( is_wp_error( $videos ) ) {
                self::send_api_result( $videos );
            }

            $campaigns = array();
            foreach ( $videos as $video ) {
                if ( ! is_array( $video ) ) {
                    continue;
                }

                $products = self::api_data( $service->list_products( isset( $video['id'] ) ? $video['id'] : 0 ) );
                $video['products'] = is_wp_error( $products ) ? array() : $products;
                $campaigns[] = $video;
            }

            wp_send_json_success( $campaigns );
        } catch ( Throwable $e ) {
            self::send_exception( $e );
        }
    }

    public static function ajax_create_campaign() {
        try {
            self::verify_request();
            self::ensure_service_key_available();

            $payload = self::campaign_payload_from_request();
            if ( is_wp_error( $payload ) ) {
                wp_send_json_error( self::error_payload( $payload ), 400 );
            }

            $service = new RDI_Video_Service( self::api_client() );
            $res = $service->create_video( $payload );
            self::send_api_result( $res, 201 );
        } catch ( Throwable $e ) {
            self::send_exception( $e );
        }
    }

    public static function ajax_create_campaign_product() {
        try {
            self::verify_request();
            self::ensure_service_key_available();

            $video_id = isset( $_POST['video_id'] ) ? absint( $_POST['video_id'] ) : 0;
            if ( ! $video_id ) {
                wp_send_json_error( array( 'message' => 'Campaign inválida.' ), 400 );
            }

            $payload = self::product_payload_from_request();
            if ( is_wp_error( $payload ) ) {
                wp_send_json_error( self::error_payload( $payload ), 400 );
            }

            $service = new RDI_Video_Service( self::api_client() );
            $res = $service->create_product( $video_id, $payload );
            self::send_api_result( $res, 201 );
        } catch ( Throwable $e ) {
            self::send_exception( $e );
        }
    }

    private static function verify_request() {
        if ( ! check_ajax_referer( self::NONCE_ACTION, 'nonce', false ) ) {
            wp_send_json_error( array( 'message' => 'Nonce inválido ou expirado.' ), 403 );
        }

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
            $payload = array( 'message' => 'Internal service key is empty before the Campaigns API request.' );
            wp_send_json_error( self::with_debug( $payload, $diagnostics ), 500 );
        }
    }

    private static function campaign_payload_from_request() {
        $title = isset( $_POST['title'] ) ? sanitize_text_field( trim( wp_unslash( $_POST['title'] ) ) ) : '';
        $platform = isset( $_POST['platform'] ) ? sanitize_text_field( trim( wp_unslash( $_POST['platform'] ) ) ) : '';
        $original_url = isset( $_POST['original_video_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['original_video_url'] ) ) ) : '';
        $notes = isset( $_POST['notes'] ) ? sanitize_textarea_field( wp_unslash( $_POST['notes'] ) ) : '';

        if ( '' === $title || '' === $platform || '' === $original_url ) {
            return new WP_Error( 'rdi_missing_campaign_fields', 'Title, platform e original video URL são obrigatórios.' );
        }

        if ( ! filter_var( $original_url, FILTER_VALIDATE_URL ) ) {
            return new WP_Error( 'rdi_invalid_original_url', 'Original video URL inválido.' );
        }

        return array(
            'title'              => $title,
            'platform'           => $platform,
            'original_video_url' => $original_url,
            'notes'              => $notes,
            'description'        => $notes,
        );
    }

    private static function product_payload_from_request() {
        $title = isset( $_POST['title'] ) ? sanitize_text_field( trim( wp_unslash( $_POST['title'] ) ) ) : '';
        $affiliate_url = isset( $_POST['affiliate_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['affiliate_url'] ) ) ) : '';
        $position = isset( $_POST['position'] ) ? sanitize_text_field( wp_unslash( $_POST['position'] ) ) : '';
        $short_path = isset( $_POST['short_path'] ) ? sanitize_text_field( trim( wp_unslash( $_POST['short_path'] ) ) ) : '';

        if ( '' === $title || '' === $affiliate_url || '' === $position ) {
            return new WP_Error( 'rdi_missing_product_fields', 'Product title, affiliate URL e position são obrigatórios.' );
        }

        if ( ! filter_var( $affiliate_url, FILTER_VALIDATE_URL ) ) {
            return new WP_Error( 'rdi_invalid_affiliate_url', 'Affiliate URL inválido.' );
        }

        if ( ! in_array( $position, array( 'top1', 'top2', 'top3', 'top4', 'top5' ), true ) ) {
            return new WP_Error( 'rdi_invalid_position', 'Position inválida.' );
        }

        $payload = array(
            'title'         => $title,
            'affiliate_url' => $affiliate_url,
            'position'      => $position,
            'marketplace'   => 'affiliate',
        );

        if ( '' !== $short_path ) {
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

        if ( is_array( $res ) ) {
            wp_send_json_success( $res, $success_status );
        }

        $payload = array( 'message' => 'API response was not JSON.' );
        wp_send_json_error(
            self::with_debug(
                $payload,
                array(
                    'api_client' => self::api_client()->get_debug_info(),
                    'api_body'   => self::safe_body_snippet( $res ),
                )
            ),
            502
        );
    }

    private static function api_data( $res ) {
        if ( is_wp_error( $res ) ) {
            return $res;
        }

        if ( is_array( $res ) && array_key_exists( 'data', $res ) ) {
            return is_array( $res['data'] ) ? $res['data'] : array();
        }

        if ( is_array( $res ) ) {
            return $res;
        }

        return new WP_Error(
            'rdi_campaign_api_non_json',
            'API response was not JSON.',
            array(
                'body' => self::safe_body_snippet( $res ),
            )
        );
    }

    private static function error_payload( WP_Error $error ) {
        $payload = array(
            'message' => $error->get_error_message(),
            'code'    => $error->get_error_code(),
        );

        $data = $error->get_error_data();
        if ( is_array( $data ) ) {
            $debug = array(
                'api_client' => self::api_client()->get_debug_info(),
            );

            if ( isset( $data['status'] ) ) {
                $debug['api_status'] = absint( $data['status'] );
            }

            if ( isset( $data['body'] ) ) {
                $debug['api_body'] = self::safe_body_snippet( $data['body'] );
            }

            $payload = self::with_debug( $payload, $debug );
        }

        return $payload;
    }

    private static function send_exception( Throwable $e ) {
        $payload = array( 'message' => 'Campaigns AJAX error: ' . $e->getMessage() );

        wp_send_json_error(
            self::with_debug(
                $payload,
                array(
                    'file' => basename( $e->getFile() ),
                    'line' => $e->getLine(),
                )
            ),
            500
        );
    }

    private static function safe_body_snippet( $body ) {
        if ( is_array( $body ) || is_object( $body ) ) {
            $body = wp_json_encode( $body );
        }

        $text = wp_strip_all_tags( (string) $body );
        return substr( $text, 0, 300 );
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
