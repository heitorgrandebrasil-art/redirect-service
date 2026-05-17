<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class RDI_Api_Client {
    private $base_url;
    private $service_key;
    private $timeout = 15;

    public function __construct( $base_url = '', $service_key = '' ) {
        $this->base_url = rtrim( $base_url, '/' );
        $this->service_key = is_string( $service_key ) ? trim( $service_key ) : '';
    }

    public function get_debug_info() {
        return array(
            'base_url'             => $this->base_url,
            'service_key_length'   => strlen( $this->service_key ),
            'sends_service_header' => '' !== $this->service_key,
            'header_name'          => 'x-service-key',
        );
    }

    private function build_url( $path ) {
        $path = ltrim( $path, '/' );
        return $this->base_url . '/' . $path;
    }

    public function request( $method, $path, $args = array() ) {
        $url = $this->build_url( $path );

        $headers = array(
            'Accept' => 'application/json',
        );

        if ( '' !== $this->service_key ) {
            // Node API expects header `x-service-key` by default (see src/config.js)
            $headers['x-service-key'] = $this->service_key;
        }

        $options = array(
            'method'  => strtoupper( $method ),
            'timeout' => $this->timeout,
            'headers' => $headers,
        );

        if ( isset( $args['body'] ) ) {
            $options['body'] = is_array( $args['body'] ) ? wp_json_encode( $args['body'] ) : $args['body'];
            $options['headers']['Content-Type'] = 'application/json';
        }

        $response = wp_remote_request( $url, $options );

        if ( is_wp_error( $response ) ) {
            return new WP_Error( 'rdi_request_error', $response->get_error_message() );
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = wp_remote_retrieve_body( $response );

        $data = null;
        if ( $body ) {
            $decoded = json_decode( $body, true );
            $data = null === $decoded ? $body : $decoded;
        }

        if ( $code < 200 || $code >= 300 ) {
            $message = is_string( $data ) ? $data : ( isset( $data['message'] ) ? $data['message'] : 'HTTP ' . $code );
            return new WP_Error( 'rdi_http_error', $message, array( 'status' => $code, 'body' => $data ) );
        }

        return $data;
    }

    public function get( $path ) {
        return $this->request( 'GET', $path );
    }

    public function post( $path, $body = null ) {
        return $this->request( 'POST', $path, array( 'body' => $body ) );
    }

    public function put( $path, $body = null ) {
        return $this->request( 'PUT', $path, array( 'body' => $body ) );
    }

    public function delete( $path ) {
        return $this->request( 'DELETE', $path );
    }
}
