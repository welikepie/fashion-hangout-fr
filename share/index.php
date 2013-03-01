<?php

	define('CLOTHING_JSON', 'http://bethebuyer.topshop.com/data/clothing.jsonp');
	define('JSONP_OFFSET_START', 7);
	define('JSONP_OFFSET_END', 3);
	
	// Retrieve and parse the IDs of clothing used in this instance
	$clothes_id = array_map("intval", explode(",", $_GET['c']));
	
	// Retrieve and parse the clothing data,
	// filter only by the clothes provided in the collection here.
	$curl = curl_init();
	curl_setopt_array($curl, array(
		CURLOPT_URL => CLOTHING_JSON,
		CURLOPT_RETURNTRANSFER => true,
		CURLOPT_SSL_VERIFYPEER => false,
		CURLOPT_SSL_VERIFYHOST => 0,
		CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1
	));
	$json = curl_exec($curl);
	curl_close($curl); unset($curl);
	
	$json = substr($json, JSONP_OFFSET_START, strlen($json) - JSONP_OFFSET_START - JSONP_OFFSET_END);
	$clothing = json_decode($json, true);
	
	$collection = array();
	foreach ($clothing as $item) {
		if (in_array($item['id'], $clothes_id)) {
			$collection[] = $item;
		}
	}
	
	unset($clothing);
	unset($json);
	
	$image = false;

?><!DOCTYPE html>
<html itemscope itemtype="http://schema.org/ImageObject">
	<head>
		<title itemprop="name">#BeTheBuyer</title>
		<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
		
		<meta itemprop="representativeOfPage" content="true">
		<meta itemprop="description" content="See what I love from Topshop Uniques AW13 show with their Be The Buyer app.">
		
		<link rel="stylesheet" href="styles.css" type="text/css">
		<link rel="canonical" href="http://bethebuyer.topshop.com/share/?<?php echo($_SERVER['QUERY_STRING']); ?>" itemprop="url">
		
		<script type="text/javascript">

		  var _gaq = _gaq || [];
		  _gaq.push(['_setAccount', 'UA-37546944-3']);
		  _gaq.push(['_setDomainName', 'none']);
		  _gaq.push(['_trackPageview']);

		  (function() {
			var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
			ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
			var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
		  })();

		</script>
	</head>
	<body>
		<header>
			<h1>Topshop</h1>
			<h2>Unique AW13 : Be The Buyer</h2>
			<p>See what I love from Topshop Unique�s AW13 show with their Be The Buyer app.</p>
		</header>
		<section id="collection">
		
			<ul class="items">
				<?php foreach ($collection as &$item) { ?>
				<li>
					<img src="<?php echo(htmlspecialchars($item['photo'])); ?>" alt="<?php echo(htmlspecialchars($item['name'])); ?>"<?php if (!$image) { echo('  itemprop="contentURL"'); $image = true; } ?>>
					<h2><?php echo(htmlspecialchars($item['name'])); ?></h2>
				</li>
				<?php } ?>
			</ul>
		
		</section>
		<footer>
			<p>Take part in Be The Buyer for your chance to win a shopping spree!</p>
			<a href="http://bethebuyer.topshop.com" target="_blank" class="app">Launch the App</a>
			<a href="http://www.topshop.com/webapp/wcs/stores/servlet/CatalogNavigationSearchResultCmd?catalogId=33057&storeId=12556&langId=-1&viewAllFlag=false&categoryId=259987&interstitial=true&intcmpid=W_FOOTER_WK45_HP_UK_TERMSCONDITIONS" target="_blank" class="terms">Terms &amp; Conditions</a>
		</footer>
	</body>
</html>
