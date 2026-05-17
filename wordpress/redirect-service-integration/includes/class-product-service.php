<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class RDI_Product_Service {
    private $client;

    public function __construct( RDI_Api_Client $client ) {
        $this->client = $client;
    }

    public function list_products() {
        return $this->client->get( '/products' );
    }

    public function get_product( $id ) {
        return $this->client->get( '/products/' . intval( $id ) );
    }
}
