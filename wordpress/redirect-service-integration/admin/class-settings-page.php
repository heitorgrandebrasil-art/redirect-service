<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class RDI_Settings_Page {
    const OPTION_KEY = 'rdi_settings';

    public static function init() {
        add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
        add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_scripts' ) );
        add_action( 'wp_ajax_rdi_test_connection', array( __CLASS__, 'ajax_test_connection' ) );
    }

    public static function add_menu() {
        add_options_page( 'Redirect Service', 'Redirect Service', 'manage_options', 'rdi-settings', array( __CLASS__, 'render_page' ) );
    }

    public static function register_settings() {
        register_setting( 'rdi_options', self::OPTION_KEY, array( __CLASS__, 'sanitize_settings' ) );

        add_settings_section( 'rdi_main', 'Configurações de Integração', '__return_false', 'rdi-settings' );

        add_settings_field( 'api_url', 'API URL', array( __CLASS__, 'field_api_url' ), 'rdi-settings', 'rdi_main' );
        add_settings_field( 'public_base_url', 'Public Base URL', array( __CLASS__, 'field_public_base_url' ), 'rdi-settings', 'rdi_main' );
        add_settings_field( 'service_key', 'Internal Service Key', array( __CLASS__, 'field_service_key' ), 'rdi-settings', 'rdi_main' );
        add_settings_field( 'telegram_bot', 'Telegram Bot Token', array( __CLASS__, 'field_telegram_bot' ), 'rdi-settings', 'rdi_main' );
        add_settings_field( 'telegram_chat', 'Telegram Chat ID', array( __CLASS__, 'field_telegram_chat' ), 'rdi-settings', 'rdi_main' );
        add_settings_field( 'ai_key', 'Optional AI API Key', array( __CLASS__, 'field_ai_key' ), 'rdi-settings', 'rdi_main' );
    }

    public static function sanitize_settings( $input ) {
        $out = array();
        $out['api_url'] = isset( $input['api_url'] ) ? esc_url_raw( trim( $input['api_url'] ) ) : '';
        $out['public_base_url'] = isset( $input['public_base_url'] ) ? esc_url_raw( trim( $input['public_base_url'] ) ) : '';

        // encrypt sensitive fields
        if ( isset( $input['service_key'] ) && $input['service_key'] !== '' ) {
            $out['service_key'] = self::encrypt_value( sanitize_text_field( $input['service_key'] ) );
        } else {
            $existing = self::get_settings();
            if ( isset( $existing['service_key'] ) ) {
                $out['service_key'] = $existing['service_key'];
            }
        }

        if ( isset( $input['telegram_bot'] ) && $input['telegram_bot'] !== '' ) {
            $out['telegram_bot'] = self::encrypt_value( sanitize_text_field( $input['telegram_bot'] ) );
        } else {
            $existing = isset( $existing ) ? $existing : self::get_settings();
            if ( isset( $existing['telegram_bot'] ) ) {
                $out['telegram_bot'] = $existing['telegram_bot'];
            }
        }

        if ( isset( $input['telegram_chat'] ) ) {
            $out['telegram_chat'] = sanitize_text_field( $input['telegram_chat'] );
        }

        if ( isset( $input['ai_key'] ) && $input['ai_key'] !== '' ) {
            $out['ai_key'] = self::encrypt_value( sanitize_text_field( $input['ai_key'] ) );
        } else {
            $existing = isset( $existing ) ? $existing : self::get_settings();
            if ( isset( $existing['ai_key'] ) ) {
                $out['ai_key'] = $existing['ai_key'];
            }
        }

        add_settings_error( 'rdi_messages', 'rdi_saved', 'Configurações salvas.', 'updated' );

        return $out;
    }

    public static function get_settings() {
        $s = get_option( self::OPTION_KEY, array() );
        return is_array( $s ) ? $s : array();
    }

    public static function decrypt_field( $key ) {
        $s = self::get_settings();
        if ( empty( $s[ $key ] ) ) {
            return '';
        }
        return self::normalize_secret( self::decrypt_value( $s[ $key ] ) );
    }

    public static function get_api_url() {
        $s = self::get_settings();
        $api_url = isset( $s['api_url'] ) ? trim( $s['api_url'] ) : '';

        if ( '' === $api_url ) {
            $api_url = getenv( 'RDI_API_URL' ) ?: 'http://api:4000/api/v1';
        }

        return $api_url;
    }

    public static function get_public_base_url() {
        $s = self::get_settings();
        $public_base_url = isset( $s['public_base_url'] ) ? trim( $s['public_base_url'] ) : '';

        if ( '' === $public_base_url ) {
            $public_base_url = getenv( 'RDI_PUBLIC_BASE_URL' ) ?: '';
        }

        return rtrim( $public_base_url, '/' );
    }

    public static function get_service_key() {
        $diagnostics = self::get_service_key_diagnostics();
        return $diagnostics['final_length'] > 0 ? $diagnostics['final_value'] : '';
    }

    public static function api_client() {
        return new RDI_Api_Client( self::get_api_url(), self::get_service_key() );
    }

    public static function get_service_key_diagnostics() {
        $s = self::get_settings();
        $stored = isset( $s['service_key'] ) ? $s['service_key'] : '';
        $decrypted = '';
        $decrypt_type = 'missing';

        if ( '' !== $stored ) {
            $raw_decrypted = self::decrypt_value( $stored );
            $decrypt_type = gettype( $raw_decrypted );
            $decrypted = self::normalize_secret( $raw_decrypted );
        }

        $env_value = self::normalize_secret( getenv( 'RDI_INTERNAL_SERVICE_KEY' ) );
        $final_value = '' !== $decrypted ? $decrypted : $env_value;
        $source = '' !== $decrypted ? 'saved_option' : ( '' !== $env_value ? 'environment' : 'empty' );

        return array(
            'option_exists'     => array_key_exists( 'service_key', $s ),
            'stored_length'     => is_string( $stored ) ? strlen( $stored ) : 0,
            'decrypt_type'      => $decrypt_type,
            'decrypted_length'  => strlen( $decrypted ),
            'env_present'       => '' !== $env_value,
            'env_length'        => strlen( $env_value ),
            'final_length'      => strlen( $final_value ),
            'source'            => $source,
            'final_value'       => $final_value,
        );
    }

    public static function get_public_service_key_diagnostics() {
        $diagnostics = self::get_service_key_diagnostics();
        unset( $diagnostics['final_value'] );
        return $diagnostics;
    }

    private static function normalize_secret( $value ) {
        return is_string( $value ) ? trim( $value ) : '';
    }

    private static function encrypt_value( $plaintext ) {
        if ( ! function_exists( 'openssl_encrypt' ) ) {
            return $plaintext;
        }
        // Prefer WordPress AUTH_KEY constant; fallback to environment variable RDI_AUTH_KEY
        if ( defined( 'AUTH_KEY' ) ) {
            $key = AUTH_KEY;
        } else {
            $key = getenv( 'RDI_AUTH_KEY' ) ?: '';
        }
        $ivlen = openssl_cipher_iv_length( 'AES-256-CBC' );
        $iv = openssl_random_pseudo_bytes( $ivlen );
        $ciphertext_raw = openssl_encrypt( $plaintext, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv );
        $hmac = hash_hmac( 'sha256', $ciphertext_raw, $key, true );
        return base64_encode( $iv . $hmac . $ciphertext_raw );
    }

    private static function decrypt_value( $c ) {
        if ( ! function_exists( 'openssl_decrypt' ) ) {
            return $c;
        }
        if ( defined( 'AUTH_KEY' ) ) {
            $key = AUTH_KEY;
        } else {
            $key = getenv( 'RDI_AUTH_KEY' ) ?: '';
        }
        $c = base64_decode( $c );
        $ivlen = openssl_cipher_iv_length( 'AES-256-CBC' );
        $iv = substr( $c, 0, $ivlen );
        $hmac = substr( $c, $ivlen, $sha2len = 32 );
        $ciphertext_raw = substr( $c, $ivlen + $sha2len );
        $original_plaintext = openssl_decrypt( $ciphertext_raw, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv );
        $calcmac = hash_hmac( 'sha256', $ciphertext_raw, $key, true );
        if ( is_string( $original_plaintext ) && hash_equals( $hmac, $calcmac ) ) {
            return $original_plaintext;
        }
        return '';
    }

    public static function enqueue_scripts( $hook ) {
        if ( $hook !== 'settings_page_rdi-settings' ) {
            return;
        }

        wp_enqueue_script( 'rdi-admin', plugin_dir_url( __FILE__ ) . 'js/settings.js', array( 'jquery' ), '0.1.0', true );
        wp_localize_script( 'rdi-admin', 'rdiAdmin', array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'nonce'    => wp_create_nonce( 'rdi_settings_nonce' ),
        ) );
    }

    public static function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( 'Sem permissão' );
        }

        $s = self::get_settings();
        ?>
        <div class="wrap">
            <h1>Redirect Service Integration</h1>
            <?php settings_errors( 'rdi_messages' ); ?>
            <form method="post" action="options.php">
                <?php
                settings_fields( 'rdi_options' );
                do_settings_sections( 'rdi-settings' );
                ?>
                <p class="submit">
                    <?php submit_button(); ?>
                </p>
            </form>

            <h2>Testar Conexão</h2>
            <p>
                <button id="rdi-test-api" class="button">Testar API</button>
                <span id="rdi-test-api-result" style="margin-left:10px"></span>
            </p>
        </div>
        <?php
    }

    public static function field_api_url() {
        printf( '<input type="url" name="%s[api_url]" value="%s" class="regular-text" />', esc_attr( self::OPTION_KEY ), esc_attr( self::get_api_url() ) );
    }

    public static function field_public_base_url() {
        printf(
            '<input type="url" name="%s[public_base_url]" value="%s" class="regular-text" placeholder="https://redirects.example.com" /><p class="description">Used for public redirect links shown in admin, e.g. https://redirects.example.com/r/teste.</p>',
            esc_attr( self::OPTION_KEY ),
            esc_attr( self::get_public_base_url() )
        );
    }

    public static function field_service_key() {
        printf( '<input type="text" name="%s[service_key]" value="%s" class="regular-text" autocomplete="off" />', esc_attr( self::OPTION_KEY ), esc_attr( self::get_service_key() ) );
    }

    public static function field_telegram_bot() {
        $val = self::decrypt_field( 'telegram_bot' );
        printf( '<input type="text" name="%s[telegram_bot]" value="%s" class="regular-text" autocomplete="off" />', esc_attr( self::OPTION_KEY ), esc_attr( $val ) );
    }

    public static function field_telegram_chat() {
        $s = self::get_settings();
        printf( '<input type="text" name="%s[telegram_chat]" value="%s" class="regular-text" />', esc_attr( self::OPTION_KEY ), esc_attr( isset( $s['telegram_chat'] ) ? $s['telegram_chat'] : '' ) );
    }

    public static function field_ai_key() {
        $val = self::decrypt_field( 'ai_key' );
        printf( '<input type="text" name="%s[ai_key]" value="%s" class="regular-text" autocomplete="off" />', esc_attr( self::OPTION_KEY ), esc_attr( $val ) );
    }

    public static function ajax_test_connection() {
        check_ajax_referer( 'rdi_settings_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Sem permissão', 403 );
        }

        $api_url = self::get_api_url();

        if ( empty( $api_url ) ) {
            wp_send_json_error( 'API URL não configurada' );
        }

        $client = self::api_client();
        $res = $client->get( '/health' );

        if ( is_wp_error( $res ) ) {
            wp_send_json_error( $res->get_error_message() );
        }

        wp_send_json_success( $res );
    }
}
