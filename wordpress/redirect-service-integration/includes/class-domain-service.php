<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class RDI_Domain_Service {
    private $client;

    public function __construct( RDI_Api_Client $client ) {
        $this->client = $client;
    }

    public function list_domains() {
        return $this->client->get( '/domains' );
    }

    public function get_domain( $id ) {
        return $this->client->get( '/domains/' . intval( $id ) );
    }
}
