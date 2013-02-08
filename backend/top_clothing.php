<?php

	define("CLOTHING_PATH", "../data/clothing.jsonp");
	define("CACHE_FILENAME", dirname(__FILE__) . "/top_clothing.dat");
	define("CACHE_TIMEOUT", 600);

	define('JSONP_OFFSET_START', 7);
	define('JSONP_OFFSET_END', 2);

	function build_url ($base, $params) {

		$url = array();
		foreach ($params as $key => &$value) { $url[] = urlencode($key) . '=' . urlencode($value); }
		$url = implode('&', $url); if (strlen($base) && strlen($url)) { $url = '?' . $url; }
		return $base . $url;

	}
	function local_url () {
		$protocol = "http" . (isset($_SERVER['HTTPS']) ? 's' : '');
		$port = $_SERVER['SERVER_PORT'];
		if (
			($port === '80' && $protocol === 'http') ||
			($port === '443' && $protocol === 'https')
		) { $port = ''; } else { $port = ':' . $port; }
		return "{$protocol}://{$_SERVER['HTTP_HOST']}{$port}{$_SERVER['PHP_SELF']}";
	}

	// TOP SHARED CLOTHING ARTICLES
	// ----------------------------------

	$time = time();
	if (file_exists(CACHE_FILENAME)) {
		list($credentials, $result, $mtime) = unserialize(file_get_contents(CACHE_FILENAME));
	} else {
		$credentials = array(
			'client_id' => '933972638530-gga9ju41ks53ju4vfmrlssrekmdcc0go.apps.googleusercontent.com',
			'client_secret' => 'od-pvsUFJm0y_BiTZ4R49yaB',
			'refresh_token' => NULL,
			'access_token' => NULL,
			'token_expiry' => 0
		);
		$result = array();
		$mtime = 0;
	}

	function cleanup() {
		global $credentials;
		global $result;
		global $mtime;
		file_put_contents(CACHE_FILENAME, serialize(array($credentials, $result, $mtime)));
	}
	register_shutdown_function('cleanup');

	// SPECIAL - RETRIEVE ACCESS TOKENS
	if (isset($_GET['code'])) {

		$params = array(
			'code' => $_GET['code'],
			'client_id' => $credentials['client_id'],
			'client_secret' => $credentials['client_secret'],
			'redirect_uri' => local_url(),
			'grant_type' => 'authorization_code'
		);

		$curl = curl_init();
		curl_setopt_array($curl, array(
			CURLOPT_POST => true,
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_SSL_VERIFYPEER => false,
			CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
			CURLOPT_SSLVERSION => 3,
			CURLOPT_POSTFIELDS => build_url('', $params),
			CURLOPT_URL => 'https://accounts.google.com/o/oauth2/token'
		));

		$data = json_decode(curl_exec($curl), true);
		curl_close($curl); unset($curl);

		if (isset($data['refresh_token'])) { $credentials['refresh_token'] = $data['refresh_token']; }
		$credentials['access_token'] = $data['access_token'];
		$credentials['token_expiry'] = $time + $data['expires_in'];

		unset($data);

	// SPECIAL - MAKE A REQUEST FOR TOKEN
	} elseif (!$credentials['refresh_token']) {

		$params = array(
			'response_type' => 'code',
			'client_id' => $credentials['client_id'],
			'redirect_uri' => local_url(),
			'scope' => 'https://www.googleapis.com/auth/analytics.readonly',
			'access_type' => 'offline'
		);

		header('HTTP/1.1 307 Temporary Redirect', true, 307);
		header('Location: ' . build_url('https://accounts.google.com/o/oauth2/auth', $params));
		exit();

	}

	// RETRIEVE NEW RESULTS IF CACHE HAS EXPIRED
	if ($mtime + CACHE_TIMEOUT < $time) {

		if (!($credentials['access_token'] && ($credentials['token_expiry'] >= $time))) {

			// Refresh access token, if current one is expired
			$params = array(
				'refresh_token' => $credentials['refresh_token'],
				'client_id' => $credentials['client_id'],
				'client_secret' => $credentials['client_secret'],
				'grant_type' => 'refresh_token'
			);

			$curl = curl_init();
			curl_setopt_array($curl, array(
				CURLOPT_POST => true,
				CURLOPT_RETURNTRANSFER => true,
				CURLOPT_SSL_VERIFYPEER => false,
				CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
				CURLOPT_SSLVERSION => 3,
				CURLOPT_POSTFIELDS => build_url('', $params),
				CURLOPT_URL => 'https://accounts.google.com/o/oauth2/token'
			));

			$data = json_decode(curl_exec($curl), true);
			curl_close($curl); unset($curl);

			$credentials['access_token'] = $data['access_token'];
			$credentials['token_expiry'] = $time + $data['expires_in'];
			unset($data);

		}

		// Retrieve the data set of X most popular clothing items from GA
		$start_date = new DateTime();
		$end_date = new DateTime();
		$start_date->modify('-1 month');

		$params = array(
			'ids' => 'ga:68865442',
			'dimensions' => 'ga:customVarValue1',
			'metrics' => 'ga:totalEvents',
			'filters' => 'ga:eventAction==Item Added',
			'sort' => '-ga:totalEvents',
			'start-date' => $start_date->format('Y-m-d'),
			'end-date' => $end_date->format('Y-m-d'),
			'max-results' => isset($_GET['limit']) ? intval($_GET['limit'], 10) : 10
		);

		$curl = curl_init();
		curl_setopt_array($curl, array(
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_SSL_VERIFYPEER => false,
			CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
			CURLOPT_SSLVERSION => 3,
			CURLOPT_URL => build_url('https://www.googleapis.com/analytics/v3/data/ga', $params),
			CURLOPT_HTTPHEADER => array('Authorization: Bearer ' . $credentials['access_token'])
		));

		$ga = json_decode(curl_exec($curl), true);
		curl_close($curl); unset($curl);
		$mtime = $time;

		$clothing = file_get_contents(CLOTHING_PATH);
		$clothing = substr($clothing, JSONP_OFFSET_START, strlen($clothing) - JSONP_OFFSET_START - JSONP_OFFSET_END);
		$clothing = json_decode($clothing, true);

		// Process clothing
		$result = array();
		foreach($ga['rows'] as &$row) {
			$temp = null;
			foreach($clothing as &$item) {
				if ($item['id'] === intval($row[0], 10)) {
					$temp = $item;
					break;
				}
			}
			if ($temp) {
				$temp['count'] = intval($row[1], 10);
				$result[] = $temp;
			}
		}

		unset($ga); unset($clothing);
		header('X-State: Generated');

	} else {
		header('X-State: From-Cache');
	}

	$print = json_encode($result);

	header('HTTP/1.1 200 OK', true, 200);
	header('Content-Type: ' . (isset($_GET['callback']) ? 'application/javascript' : 'application/json') . '; charset=utf-8');
	header('Content-Length: ' . (strlen($print) + (isset($_GET['callback']) ? strlen($_GET['callback']) + 3 : 0)));
	header('Connection: close');

	header('Cache-Control: max-age=' . CACHE_TIMEOUT);
	header('Expires: ' . gmdate('D, d M Y H:i:s T', $mtime + CACHE_TIMEOUT));
	header('Last-Modified: ' . gmdate('D, d M Y H:i:s T', $mtime));

	header('Access-Control-Allow-Origin: *');
	header('Access-Control-Allow-Methods: POST, GET, HEAD, OPTIONS');

	echo(
		isset($_GET['callback']) ?
		"{$_GET['callback']}({$print});" :
		$print
	);

?>