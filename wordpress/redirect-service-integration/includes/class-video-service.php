<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class RDI_Video_Service {
    private $client;

    public function __construct( RDI_Api_Client $client ) {
        $this->client = $client;
    }

    public function list_videos() {
        return $this->client->get( '/videos' );
    }

    public function create_video( $data ) {
        return $this->client->post( '/videos', $data );
    }

    public function get_video( $id ) {
        return $this->client->get( '/videos/' . intval( $id ) );
    }

    public function list_products( $id ) {
        return $this->client->get( '/videos/' . intval( $id ) . '/products' );
    }

    public function create_product( $id, $data ) {
        return $this->client->post( '/videos/' . intval( $id ) . '/products', $data );
    }
}
