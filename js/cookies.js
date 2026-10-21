(function() {
  const cookieBanner = document.getElementById('cookieBanner');
  const btnAccept = document.getElementById('btnAccept');
  const btnReject = document.getElementById('btnReject');
  const GTM_ID = 'GTM-N77K3KBS'; 

  function loadGTM() {
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer', GTM_ID);
  }

  const consent = localStorage.getItem('cookieConsent');
  if (consent === 'true') { loadGTM(); } 
  else if (consent === 'false') { } 
  else { cookieBanner.style.display = 'flex'; }

  btnAccept.addEventListener('click', function() {
    localStorage.setItem('cookieConsent', 'true');
    cookieBanner.style.display = 'none';
    loadGTM();
  });

  btnReject.addEventListener('click', function() {
    localStorage.setItem('cookieConsent', 'false');
    cookieBanner.style.display = 'none';
  });
})();
