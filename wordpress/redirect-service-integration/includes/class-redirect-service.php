<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class RDI_Redirect_Service {
    private $client;

    public function __construct( RDI_Api_Client $client ) {
        $this->client = $client;
    }

    public function list_redirects() {
        return $this->client->get( '/redirects' );
    }

    public function get_analytics() {
        return $this->client->get( '/redirects/analytics' );
    }

    public function create_redirect( $data ) {
        return $this->client->post( '/redirects', $data );
    }

    public function update_redirect( $id, $data ) {
        return $this->client->request( 'PATCH', '/redirects/' . intval( $id ), array( 'body' => $data ) );
    }

    public function delete_redirect( $id ) {
        return $this->client->delete( '/redirects/' . intval( $id ) );
    }
}
