<?php
/**
 * Plugin Name: Redirect Service Integration
 * Description: Integração WordPress com o Redirect Node.js API (videos, products, domains, redirects).
 * Version: 0.1.0
 * Author: Copilot
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'RDI_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

require_once RDI_PLUGIN_DIR . 'includes/class-api-client.php';
require_once RDI_PLUGIN_DIR . 'includes/class-video-service.php';
require_once RDI_PLUGIN_DIR . 'includes/class-product-service.php';
require_once RDI_PLUGIN_DIR . 'includes/class-domain-service.php';
require_once RDI_PLUGIN_DIR . 'includes/class-redirect-service.php';
require_once RDI_PLUGIN_DIR . 'admin/class-settings-page.php';
require_once RDI_PLUGIN_DIR . 'admin/class-redirects-page.php';
require_once RDI_PLUGIN_DIR . 'admin/class-campaigns-page.php';

function rdi_init_plugin() {
    RDI_Settings_Page::init();
    RDI_Redirects_Page::init();
    RDI_Campaigns_Page::init();
}

add_action( 'plugins_loaded', 'rdi_init_plugin' );
