(function () {
  // --- 1. FIREBASE CONFIGURATION ---
  const firebaseConfig = {
      apiKey: "AIzaSyDBqaofgjviMoq_YSaFuXMVmSm-47KzvOM",
      authDomain: "coinfliip-multiplayer.firebaseapp.com",
      databaseURL: "https://coinfliip-multiplayer-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "coinfliip-multiplayer",
      storageBucket: "coinfliip-multiplayer.firebasestorage.app",
      messagingSenderId: "634679701084",
      appId: "1:634679701084:web:1c036b210224f2a41cc099"
  };

  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();
  const auth = firebase.auth();

  // 2. AUTH LOGIC (SOLUCIÓN MEJORADA)
  // MOVED LANGUAGE HERE TO FIX REFERENCE ERROR
  const userLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
  const isEnglish = userLang.startsWith('en');
  const isSpanish = !isEnglish; 
  
  // MODIFIED: Init name as null to set properly later or use temp default
  let currentPlayerName = isSpanish ? 'Tú' : 'You'; 
  let originalNameBeforeReaction = null; // Store real name during emoji reaction

  let userId = null; 
  const authStatusEl = document.getElementById('authStatus');
  
  // Timeout para que no se quede cargando infinito
  // Si en 5 segundos no hay auth, desbloqueamos el botón igualmente
  const AUTH_TIMEOUT_MS = 5000;
  
  // --- LOGIC FOR AUTO-JOIN VIA URL ---
  let pendingRoomJoin = null;
  
  // Check for ?room=CODE in URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
      console.log("Room param detected:", roomParam);
      pendingRoomJoin = roomParam.toUpperCase();
  }

  function updateAuthUI(isReady, isError = false) {
      const btnMulti = document.getElementById('btnMultiplayerMenu');
      const statusDiv = document.getElementById('authStatus');
      
      if (isReady || isError) {
          // Desbloqueamos el botón en ambos casos
          if(btnMulti) {
              btnMulti.disabled = false;
              if (isError) {
                  // Avisamos, pero dejamos probar
                  btnMulti.textContent = isSpanish ? 'Reintentar Conexión' : 'Retry Connection';
              } else {
                  btnMulti.textContent = isSpanish ? 'Modo Multijugador' : 'Multiplayer Mode';
              }
          }
          if(statusDiv) {
              if (isError) {
                  statusDiv.textContent = 'Offline / Error';
                  statusDiv.classList.add('error');
              } else {
                  statusDiv.classList.remove('visible');
              }
          }
      } else {
          // Cargando...
          if(btnMulti) {
              btnMulti.disabled = true;
              btnMulti.textContent = isSpanish ? 'Cargando...' : 'Loading...';
          }
          if(statusDiv) {
              statusDiv.textContent = isSpanish ? 'Conectando...' : 'Connecting...';
              statusDiv.classList.add('visible');
          }
      }
  }
  
  // Estado inicial
  updateAuthUI(false);
  
  // Timer de seguridad
  const authTimeout = setTimeout(() => {
      console.warn("Auth timeout - desbloqueando UI");
      if (!userId) updateAuthUI(false, true); // Desbloquear como 'Error'
  }, AUTH_TIMEOUT_MS);

  auth.onAuthStateChanged((user) => {
      if (user) {
          // ÉXITO
          clearTimeout(authTimeout);
          userId = user.uid;
          localStorage.setItem('coinfliip_userId', userId);
          console.log("Auth Exitosa. ID:", userId);
          updateAuthUI(true);
          
          // AUTO-JOIN LOGIC
          if (pendingRoomJoin) {
              console.log("Auto-joining room:", pendingRoomJoin);
              // Slight delay to ensure UI is ready
              setTimeout(() => {
                  joinRoom(pendingRoomJoin);
                  pendingRoomJoin = null;
                  // Optional: Clear URL param to avoid re-join on refresh? 
                  // window.history.replaceState({}, document.title, window.location.pathname);
              }, 500);
          }
          
      } else {
          // INTENTO DE LOGIN
          console.log("Iniciando login anónimo...");
          auth.signInAnonymously().catch((error) => {
              // Suppress domain block error in console, just warn
              if (error.code && error.code.includes('requests-from-referer')) {
                  console.warn("Auth skipped (Preview Mode): Domain not authorized.");
              } else {
                  console.error("Error Auth:", error);
              }
              
              // IMPORTANTE: Si falla, desbloqueamos el botón con estado de error
              // para que el usuario no se quede atrapado.
              clearTimeout(authTimeout);
              updateAuthUI(false, true); 
              // No mostramos toast invasivo para este error específico
              if (!error.code || !error.code.includes('requests-from-referer')) {
                  showToast("Error de conexión. Revisa si aceptaste cookies.");
              }
          });
      }
  });

  // --- GAME VARIABLES & LOGIC ---
  window.dataLayer = window.dataLayer || [];
  function sendAnalyticsEvent(eventName, params = {}) {
    window.dataLayer.push({ event: eventName, ...params, });
  }

  let totalFlips = 0; let headsCount = 0; let tailsCount = 0; let edgesCount = 0;
  let currentPoints = 0; let bestCombo = 0; let bestClaimedCombo = 0; 
  let ctaTimeoutId = null; let currentGameMode = null; 
  let currentRoomId = null; let roomSubscription = null;

  // DOM ELEMENTS
  const mainMenu = document.getElementById('mainMenu');
  const multiplayerMenu = document.getElementById('multiplayerMenu');
  const gameApp = document.getElementById('gameApp');
  
  const btnStoryMode = document.getElementById('btnStoryMode');
  const btnMultiplayerMenu = document.getElementById('btnMultiplayerMenu');
  const btnBackToMain = document.getElementById('btnBackToMain');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const btnJoinRoom = document.getElementById('btnJoinRoom');
  const btnGameExit = document.getElementById('btnGameExit');
  const btnShareRoom = document.getElementById('btnShareRoom');

  const roomCodeInput = document.getElementById('roomCodeInput');
  const headerAuthor = document.getElementById('headerAuthor');
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const roomHistoryList = document.getElementById('roomHistoryList');

  const coinButton = document.getElementById('coinButton');
  const coinBody = document.getElementById('coinBody');
  const coinShadow = document.getElementById('coinShadow');
  const coinFaceLabel = document.getElementById('coinFaceLabel');
  const speechBubble = document.getElementById('speechBubble');
  const claimButton = document.getElementById('claimButton');
  const leaderboardEl = document.getElementById('leaderboard');
  const resultPill = document.getElementById('resultPill');
  const bestClaimedPill = document.getElementById('bestClaimedPill');
  const resultPillValue = document.getElementById('bestStreakValue');
  const bestClaimedValue = document.getElementById('bestClaimedValue');
  const toast = document.getElementById('toast');
  const fireContainer = document.getElementById('fireContainer');
  const sadContainer = document.getElementById('sadContainer');
  const happyContainer = document.getElementById('happyContainer');
  const starContainer = document.getElementById('starContainer');
  const milestoneToast = document.getElementById('milestoneToast');
  const savedRoomsLabel = document.getElementById('savedRoomsLabel');
  const multiplayerTitle = document.getElementById('multiplayerTitle');
  const seoContentSection = document.getElementById('seoContentSection');

  function applyTranslations() {
      if (isSpanish) {
          document.documentElement.lang = 'es';
          if(btnStoryMode) btnStoryMode.textContent = 'Modo Historia';
          // btnMultiplayerMenu se maneja en updateAuthUI
          if(btnCreateRoom) btnCreateRoom.textContent = 'Crear Sala';
          if(btnJoinRoom) btnJoinRoom.textContent = 'Unirse';
          if(btnBackToMain) btnBackToMain.textContent = '← VOLVER';
          if(savedRoomsLabel) savedRoomsLabel.textContent = 'Tus Salas Guardadas';
          if(multiplayerTitle) multiplayerTitle.textContent = 'Multijugador';
          if(btnShareRoom) btnShareRoom.title = 'Compartir Sala';
          
          const headerBadge = document.querySelector('.header-badge');
          if (headerBadge) headerBadge.textContent = 'CARA 49.999% / CRUZ 49.999% / CANTO 0.002%';
          if(coinButton) coinButton.setAttribute('aria-label', 'Lanzar moneda');
          if(coinFaceLabel) coinFaceLabel.innerHTML = '<strong>Toca para lanzar</strong>';
          const coinFrontText = document.getElementById('coinFrontText');
          const coinBackText = document.getElementById('coinBackText');
          if(coinFrontText) coinFrontText.textContent = 'CARA';
          if(coinBackText) coinBackText.textContent = 'CRUZ';
          if(roomCodeInput) roomCodeInput.placeholder = 'CÓDIGO';
          const rulesParagraph = document.querySelector('.coin-info p');
          if (rulesParagraph) {
            rulesParagraph.innerHTML =
              'Cada <strong>CARA</strong> 😊 dobla tu marcador.<br />' +
              '<strong>CRUZ</strong> ❌ reinicia tu racha.<br />' +
              '<strong>CANTO</strong> ⭐ te da 50000 puntos.<br />' +
              '<strong>COBRAR</strong> guarda puntos y reinicia racha.';
          }
          const bestStreakLabel = document.getElementById('bestStreakLabel');
          if (bestStreakLabel) bestStreakLabel.textContent = 'MEJOR RACHA:';
          const bestClaimedLabel = document.getElementById('bestClaimedLabel');
          if (bestClaimedLabel) bestClaimedLabel.textContent = 'MEJOR COBRADA:';
          const leaderboardTitle = document.querySelector('.leaderboard-header h1');
          if (leaderboardTitle) leaderboardTitle.textContent = 'Clasificación';
          if(toast) toast.textContent = '¿CANTO IMPOSIBLE?';
          if(claimButton) claimButton.textContent = 'COBRAR';
          if (headerAuthor) headerAuthor.textContent = 'por antonio10bc';
          if(roomCodeDisplay) roomCodeDisplay.title = 'Copiar Código';
          if(btnGameExit) btnGameExit.textContent = 'MENU'; 
          
          const cookieText = document.querySelector('.cookie-text');
          if(cookieText) cookieText.textContent = 'Usamos cookies para mejorar tu experiencia.';
          const btnAccept = document.getElementById('btnAccept');
          if(btnAccept) btnAccept.textContent = 'Aceptar';
          const btnReject = document.getElementById('btnReject');
          if(btnReject) btnReject.textContent = 'Denegar';

      } else {
          if(btnStoryMode) btnStoryMode.textContent = 'Story Mode';
          if(btnCreateRoom) btnCreateRoom.textContent = 'Create Room';
          if(btnJoinRoom) btnJoinRoom.textContent = 'Join Room';
          if(btnBackToMain) btnBackToMain.textContent = '← BACK';
          if(roomCodeInput) roomCodeInput.placeholder = 'CODE';
          if(savedRoomsLabel) savedRoomsLabel.textContent = 'Your Saved Rooms';
          if(multiplayerTitle) multiplayerTitle.textContent = 'Multiplayer';
          if(btnShareRoom) btnShareRoom.title = 'Share Room';

          document.documentElement.lang = 'en';
          if(coinButton) coinButton.setAttribute('aria-label', 'Flip coin');
          if(btnGameExit) btnGameExit.textContent = 'MENU';
          if(roomCodeDisplay) roomCodeDisplay.title = 'Copy Code';
          const cookieText = document.querySelector('.cookie-text');
          if(cookieText) cookieText.textContent = 'We use cookies to improve your experience.';
          const btnAccept = document.getElementById('btnAccept');
          if(btnAccept) btnAccept.textContent = 'Accept';
          const btnReject = document.getElementById('btnReject');
          if(btnReject) btnReject.textContent = 'Reject';
      }
  }
  applyTranslations();

  const SOCIAL_LINKS_MARGIN_TOP = 24;
  document.documentElement.style.setProperty('--social-links-margin-top', SOCIAL_LINKS_MARGIN_TOP + 'px');

  const P_HEADS = 49.999; const P_TAILS = 49.999; const P_EDGE = 0.002; const P_TOTAL = P_HEADS + P_TAILS + P_EDGE; 
  const historicalNamesEn = ["Antonio Bastos de Córdoba","Malala Yousafzai","Tim Berners-Lee","Rigoberta Menchú","Valentina Tereshkova","Gabriel Garcia Marquez","Nelson Mandela","Rosa Parks","The Beatles","Deng Xiaoping","Simone de Beauvoir","Charlie Chaplin","Mao Zedong","Pablo Picasso","Kwame Nkrumah","Martin Luther King Jr.","Walt Disney","Winston Churchill","Eleanor Roosevelt","Rosalind Franklin","Albert Einstein","Alexander Fleming","Alan Turing","Frida Kahlo","Mahatma Gandhi","The Wright Brothers","Franklin D. Roosevelt","Nikola Tesla","George Washington Carver","Sigmund Freud","Mustafa Kemal Ataturk","Marie Curie","Fritz Haber","Emmeline Pankhurst","Lenin","Harriet Tubman","Florence Nightingale","Queen Victoria","Louis Pasteur","Karl Marx","Charles Darwin","Abraham Lincoln","Ada Lovelace","José de San Martín","Simón Bolívar","Ludwig van Beethoven","Napoleon Bonaparte","James Watt","Immanuel Kant","George Washington","Catherine the Great","Wolfgang Amadeus Mozart","Jean-Jacques Rousseau","Voltaire","Isaac Newton","René Descartes","Galileo Galilei","William Shakespeare","Miguel de Cervantes","Suleiman the Magnificent","Michelangelo","Martin Luther","Nicolaus Copernicus","Guru Nanak","Vasco da Gama","Leonardo da Vinci","Christopher Columbus","Isabella I of Castile","Johannes Gutenberg","Mansa Musa","Dante Alighieri","Thomas Aquinas","Genghis Khan","Saladin","Avicenna","Murasaki Shikibu","Al-Khwarizmi","Charlemagne","Wu Zetian","Muhammad","Cai Lun","Jesus of Nazareth","Augustus","Cleopatra","Julius Caesar","Qin Shi Huang","Ashoka","Alexander the Great","Aristotle","Plato","Socrates","Confucius","Buddha","Cyrus the Great","Laozi","Homer","Zoroaster","Moses","Hatshepsut"];
  const historicalNamesEs = ["Antonio Bastos de Córdoba","Malala Yousafzai","Tim Berners-Lee","Rigoberta Menchú","Valentina Tereshkova","Gabriel García Márquez","Nelson Mandela","Rosa Parks","The Beatles","Deng Xiaoping","Simone de Beauvoir","Charlie Chaplin","Mao Zedong","Pablo Picasso","Kwame Nkrumah","Martin Luther King Jr.","Walt Disney","Winston Churchill","Eleanor Roosevelt","Rosalind Franklin","Albert Einstein","Alexander Fleming","Alan Turing","Frida Kahlo","Mahatma Gandhi","Los Hermanos Wright","Franklin D. Roosevelt","Nikola Tesla","George Washington Carver","Sigmund Freud","Mustafa Kemal Ataturk","Marie Curie","Fritz Haber","Emmeline Pankhurst","Lenin","Harriet Tubman","Florence Nightingale","Reina Victoria","Louis Pasteur","Karl Marx","Charles Darwin","Abraham Lincoln","Ada Lovelace","José de San Martín","Simón Bolívar","Ludwig van Beethoven","Napoleón Bonaparte","James Watt","Immanuel Kant","George Washington","Catalina la Grande","Wolfgang Amadeus Mozart","Jean-Jacques Rousseau","Voltaire","Isaac Newton","René Descartes","Galileo Galilei","William Shakespeare","Miguel de Cervantes","Solimán el Magnífico","Miguel Ángel","Martín Lutero","Nicolás Copérnico","Guru Nanak","Vasco de Gama","Leonardo da Vinci","Cristóbal Colón","Isabel I de Castilla","Johannes Gutenberg","Mansa Musa","Dante Alighieri","Tomás de Aquino","Gengis Kan","Saladino","Avicena","Murasaki Shikibu","Al-Juarismi","Carlomagno","Wu Zetian","Mahoma","Cai Lun","Jesús de Nazaret","Augusto","Cleopatra","Julio César","Qin Shi Huang","Ashoka","Alejandro Magno","Aristóteles","Platón","Sócrates","Confucio","Buda","Ciro el Grande","Laozi","Homero","Zoroastro","Moisés","Hatshepsut"];
  const historicalNames = isSpanish ? historicalNamesEs : historicalNamesEn;

  let players = [];
  
  function getRoomHistory() {
      try { return JSON.parse(localStorage.getItem('coinfliip_rooms') || '[]'); } catch(e) { return []; }
  }

  function saveRoomToHistory(code, customName = null) {
      let history = getRoomHistory();
      const existingIndex = history.findIndex(r => r.code === code);
      const defaultName = isSpanish ? ('Sala ' + code) : ('Room ' + code);
      let isFav = false;
      if (existingIndex >= 0) {
          isFav = history[existingIndex].favorite || false;
          const room = history.splice(existingIndex, 1)[0];
          if (customName) room.name = customName; 
          room.favorite = isFav;
          history.unshift(room);
      } else {
          history.unshift({ code: code, name: customName || defaultName, favorite: false });
      }
      if (history.length > 10) history = history.slice(0, 10);
      localStorage.setItem('coinfliip_rooms', JSON.stringify(history));
      renderRoomHistory();
  }

  function toggleRoomFavorite(code) {
       let history = getRoomHistory();
       const index = history.findIndex(r => r.code === code);
       if (index >= 0) {
           history[index].favorite = !history[index].favorite;
           localStorage.setItem('coinfliip_rooms', JSON.stringify(history));
           renderRoomHistory();
       }
  }

  function deleteRoomFromHistory(code) {
      let history = getRoomHistory();
      history = history.filter(r => r.code !== code);
      localStorage.setItem('coinfliip_rooms', JSON.stringify(history));
      renderRoomHistory();
  }

  function renderRoomHistory() {
      roomHistoryList.innerHTML = '';
      let history = getRoomHistory();
      if (history.length === 0) {
          const emptyMsg = document.createElement('div');
          emptyMsg.textContent = isSpanish ? 'No hay salas recientes.' : 'No recent rooms.';
          emptyMsg.style.textAlign = 'center';
          emptyMsg.style.opacity = '0.5';
          emptyMsg.style.fontSize = '0.8rem';
          roomHistoryList.appendChild(emptyMsg);
          return;
      }
      history.sort((a, b) => {
          if (a.favorite === b.favorite) return 0;
          return a.favorite ? -1 : 1; 
      });
      history.forEach(room => {
          const wrapper = document.createElement('div');
          wrapper.className = 'room-row-wrapper';
          const roomBtn = document.createElement('div');
          roomBtn.className = 'room-item';
          roomBtn.onclick = () => { joinRoom(room.code); };
          const nameSpan = document.createElement('span');
          nameSpan.className = 'room-item-name';
          const nameText = document.createTextNode(room.name + ' ');
          nameSpan.appendChild(nameText);
          const editIcon = document.createElement('span');
          editIcon.className = 'edit-icon-btn';
          editIcon.textContent = '✏️';
          editIcon.title = isSpanish ? 'Renombrar' : 'Rename';
          editIcon.onclick = (e) => {
              e.stopPropagation();
              showRoomNameModal(room.code, room.name);
          };
          nameSpan.appendChild(editIcon);
          const rightContainer = document.createElement('div');
          rightContainer.className = 'room-item-right';
          const starIcon = document.createElement('span');
          starIcon.className = 'star-icon';
          if (room.favorite) { starIcon.textContent = '★'; starIcon.classList.add('active'); } 
          else { starIcon.textContent = '☆'; }
          starIcon.onclick = (e) => { e.stopPropagation(); toggleRoomFavorite(room.code); };
          const codeSpan = document.createElement('span');
          codeSpan.className = 'room-item-code';
          codeSpan.textContent = room.code;
          rightContainer.appendChild(starIcon);
          rightContainer.appendChild(codeSpan);
          roomBtn.appendChild(nameSpan);
          roomBtn.appendChild(rightContainer);
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'room-delete-btn';
          deleteBtn.textContent = 'X';
          deleteBtn.title = isSpanish ? 'Eliminar' : 'Delete';
          deleteBtn.onclick = () => { showDeleteRoomModal(room.code, room.name); };
          wrapper.appendChild(roomBtn);
          wrapper.appendChild(deleteBtn);
          roomHistoryList.appendChild(wrapper);
      });
  }

  let roomNameModalHandlers = null;
  function showRoomNameModal(roomCode, currentName) {
    const overlay = document.getElementById('roomNameModalOverlay');
    const input = document.getElementById('roomNameModalInput');
    const title = document.getElementById('roomNameModalTitle');
    const cancelBtn = document.getElementById('roomNameModalCancel');
    const saveBtn = document.getElementById('roomNameModalSave');
    if (!overlay) return;
    if (roomNameModalHandlers) {
      saveBtn.removeEventListener('click', roomNameModalHandlers.save);
      cancelBtn.removeEventListener('click', roomNameModalHandlers.cancel);
      input.removeEventListener('keydown', roomNameModalHandlers.keydown);
      overlay.removeEventListener('click', roomNameModalHandlers.overlay);
    }
    input.value = currentName; input.maxLength = 20; 
    if (isSpanish) {
      title.textContent = 'Nombre de Sala'; cancelBtn.textContent = 'Cancelar';
      saveBtn.textContent = 'Guardar'; input.placeholder = 'Nombre...';
    } else {
      title.textContent = 'Room Name'; cancelBtn.textContent = 'Cancel';
      saveBtn.textContent = 'Save'; input.placeholder = 'Name...';
    }
    const handleSave = function() {
      const trimmedName = input.value.trim().substring(0, 20);
      if (trimmedName.length > 0) saveRoomToHistory(roomCode, trimmedName);
      hideRoomNameModal();
    };
    const handleCancel = function() { hideRoomNameModal(); };
    const handleKeyPress = function(e) {
      if (e.key === 'Enter') { e.preventDefault(); handleSave(); } 
      else if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
    };
    const handleOverlayClick = function(e) { if (e.target === overlay) handleCancel(); };
    roomNameModalHandlers = { save: handleSave, cancel: handleCancel, keydown: handleKeyPress, overlay: handleOverlayClick };
    saveBtn.addEventListener('click', handleSave); cancelBtn.addEventListener('click', handleCancel);
    input.addEventListener('keydown', handleKeyPress); overlay.addEventListener('click', handleOverlayClick);
    overlay.classList.add('visible');
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }
  function hideRoomNameModal() { const overlay = document.getElementById('roomNameModalOverlay'); if (overlay) overlay.classList.remove('visible'); }

  let deleteRoomModalHandlers = null;
  function showDeleteRoomModal(roomCode, roomName) {
    const overlay = document.getElementById('deleteRoomModalOverlay');
    const title = document.getElementById('deleteRoomModalTitle');
    const message = document.getElementById('deleteRoomModalMessage');
    const cancelBtn = document.getElementById('deleteRoomModalCancel');
    const confirmBtn = document.getElementById('deleteRoomModalConfirm');
    if (!overlay) return;
    if (deleteRoomModalHandlers) {
      confirmBtn.removeEventListener('click', deleteRoomModalHandlers.confirm);
      cancelBtn.removeEventListener('click', deleteRoomModalHandlers.cancel);
      overlay.removeEventListener('click', deleteRoomModalHandlers.overlay);
    }
    if (isSpanish) {
      title.textContent = 'ELIMINAR SALA';
      message.innerHTML = `¿Seguro que quieres borrar <strong>${roomName}</strong> de tu historial?`;
      cancelBtn.textContent = 'CANCELAR'; confirmBtn.textContent = 'BORRAR';
    } else {
      title.textContent = 'DELETE ROOM';
      message.innerHTML = `Are you sure you want to remove <strong>${roomName}</strong> from your history?`;
      cancelBtn.textContent = 'CANCEL'; confirmBtn.textContent = 'DELETE';
    }
    const handleConfirm = function() { deleteRoomFromHistory(roomCode); hideDeleteRoomModal(); };
    const handleCancel = function() { hideDeleteRoomModal(); };
    const handleOverlayClick = function(e) { if (e.target === overlay) handleCancel(); };
    deleteRoomModalHandlers = { confirm: handleConfirm, cancel: handleCancel, overlay: handleOverlayClick };
    confirmBtn.addEventListener('click', handleConfirm); cancelBtn.addEventListener('click', handleCancel);
    overlay.addEventListener('click', handleOverlayClick);
    overlay.classList.add('visible');
  }
  function hideDeleteRoomModal() { const overlay = document.getElementById('deleteRoomModalOverlay'); if (overlay) overlay.classList.remove('visible'); }

  // --- SHARE MODAL LOGIC ---
  let shareModalHandlers = null;
  function showShareModal() {
      const overlay = document.getElementById('shareModalOverlay');
      const textArea = document.getElementById('shareMessageInput');
      const title = document.getElementById('shareModalTitle');
      const closeX = document.getElementById('shareModalCloseX');
      const confirmBtn = document.getElementById('shareModalConfirm');
      
      if (!overlay) return;
      
      // Clean up old listeners
      if (shareModalHandlers) {
          confirmBtn.removeEventListener('click', shareModalHandlers.confirm);
          closeX.removeEventListener('click', shareModalHandlers.cancel);
          overlay.removeEventListener('click', shareModalHandlers.overlay);
          textArea.removeEventListener('input', shareModalHandlers.autoResize);
      }
      
      // Set text content
      if (isSpanish) {
          title.textContent = '¡DESAFÍA A OTROS!';
          confirmBtn.textContent = 'COMPARTIR EN X';
          textArea.value = `Racha: ${bestCombo}. Cobrada: ${bestClaimedCombo}. ¡Supérame!`;
      } else {
          title.textContent = 'CHALLENGE OTHERS!';
          confirmBtn.textContent = 'SHARE ON X';
          textArea.value = `Streak: ${bestCombo}. Banked: ${bestClaimedCombo}. Beat me!`;
      }
      
      // Auto resize function
      const handleAutoResize = function() {
          this.style.height = 'auto';
          this.style.height = (this.scrollHeight) + 'px';
      };
      
      const handleConfirm = function() {
          const text = textArea.value;
          // Get base URL without query params
          const baseUrl = window.location.href.split('?')[0];
          const shareUrl = `${baseUrl}?room=${currentRoomId}`;
          const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
          window.open(twitterUrl, '_blank');
          hideShareModal();
      };
      
      const handleCancel = function() { hideShareModal(); };
      const handleOverlayClick = function(e) { if (e.target === overlay) handleCancel(); };
      
      shareModalHandlers = { confirm: handleConfirm, cancel: handleCancel, overlay: handleOverlayClick, autoResize: handleAutoResize };
      confirmBtn.addEventListener('click', handleConfirm);
      closeX.addEventListener('click', handleCancel);
      overlay.addEventListener('click', handleOverlayClick);
      textArea.addEventListener('input', handleAutoResize);
      
      overlay.classList.add('visible');
      setTimeout(() => { 
          textArea.style.height = 'auto';
          textArea.style.height = (textArea.scrollHeight) + 'px';
          textArea.focus(); 
          textArea.select(); 
      }, 50);
  }
  function hideShareModal() { const overlay = document.getElementById('shareModalOverlay'); if (overlay) overlay.classList.remove('visible'); }

  function initPlayers(mode) {
    players = [];
    if (mode === 'story') {
      players.push({ id: 'user', name: currentPlayerName, score: 0, isUser: true, lastRank: 0 });
      for (let i = 0; i < historicalNames.length; i++) {
          const score = Math.floor(999 - (i * (999 / (historicalNames.length - 1))));
          players.push({ id: 'historical' + i, name: historicalNames[i], score: score, isUser: false, lastRank: 0 });
      }
      const initialSorted = players.slice().sort((a, b) => b.score - a.score);
      initialSorted.forEach((p, i) => p.lastRank = i + 1);
      loadGameData();
      const user = players.find(p => p.isUser);
      if (user) currentPlayerName = user.name;
    } 
  }

  function showMainMenu() {
      mainMenu.classList.remove('hidden');
      multiplayerMenu.classList.add('hidden');
      gameApp.classList.add('hidden');
      document.body.classList.remove('multiplayer-theme');
  }
  function showMultiplayerMenu() {
      // Reintentar si falló
      if (!auth.currentUser) {
          console.log("Reintentando auth manual al entrar al menú...");
          auth.signInAnonymously().catch(e => console.warn(e));
      }
      
      mainMenu.classList.add('hidden');
      multiplayerMenu.classList.remove('hidden');
      gameApp.classList.add('hidden');
      document.body.classList.add('multiplayer-theme');
      renderRoomHistory();
  }

  function startGame(mode) {
      currentGameMode = mode;
      if (mode === 'story') {
          // FIX: Limpiamos variables ANTES de cargar para evitar datos basura del multijugador
          currentPoints = 0; 
          bestCombo = 0; 
          bestClaimedCombo = 0;

          // INIT llama a loadGameData(), que sobreescribe bestCombo y bestClaimedCombo si existen datos guardados
          initPlayers('story');
          
          updateLeaderboard();
          mainMenu.classList.add('hidden');
          gameApp.classList.remove('hidden');
          if(seoContentSection) seoContentSection.classList.remove('hidden'); 
          if(roomCodeDisplay) roomCodeDisplay.style.display = 'none'; 
          // Hide share button in story mode
          if(btnShareRoom) btnShareRoom.style.display = 'none';
          
          document.body.classList.remove('multiplayer-theme');
          
          // YA NO REINICIAMOS A 0 AQUI, porque borraríamos lo que acabamos de cargar
          updateSpeechBubble(); updateBestCombo(); updateBestClaimedCombo(); scheduleIdleCta();
          sendAnalyticsEvent('start_game', { mode: 'story' });
          if(headerAuthor) headerAuthor.textContent = isSpanish ? 'por antonio10bc' : 'by antonio10bc';
      } 
  }

  // --- NEW: Function to generate random name like Coinfliiper000
  function generateRandomName() {
      const num = Math.floor(Math.random() * 900) + 100; // 100 to 999
      return "Coinfliiper" + num;
  }

  function joinRoom(code) {
       currentRoomId = code;
       currentGameMode = 'multiplayer';
       
       // --- FIX: NO PERMITIR JOIN SI AUTH ES NULL ---
       // Fallback local mode
       const safeUserId = auth.currentUser ? auth.currentUser.uid : userId;

       if (!safeUserId) {
           showToast(isSpanish ? "Esperando ID..." : "Waiting for ID...");
           return;
       }
       
       const playerRef = db.ref('rooms/' + currentRoomId + '/players/' + safeUserId);
       playerRef.get().then((snapshot) => {
           if (snapshot.exists()) {
               const data = snapshot.val();
               if (data.name) currentPlayerName = data.name;
               if (data.bestStreak) bestCombo = data.bestStreak;
               if (data.bestClaimed) bestClaimedCombo = data.bestClaimed;
               updateBestCombo(); updateBestClaimedCombo();
               return; 
           } else {
               // NEW: Use random Coinfliiper name for new users in multiplayer
               currentPlayerName = generateRandomName();
               bestCombo = 0; bestClaimedCombo = 0;
               return playerRef.set({
                   name: currentPlayerName,
                   score: 0,
                   bestStreak: 0,
                   bestClaimed: 0
               });
           }
       }).then(() => {
           subscribeToRoom(currentRoomId);
           if(seoContentSection) seoContentSection.classList.add('hidden');
           if(roomCodeDisplay) {
               roomCodeDisplay.textContent = currentRoomId; 
               roomCodeDisplay.style.display = 'flex'; // Changed to flex for centering
           }
           // Show share button in multiplayer
           if(btnShareRoom) btnShareRoom.style.display = 'flex'; // Changed to flex for centering SVG
           
           // FIX: Force hide all screens first to prevent overlaps (Clean Slate)
           if(mainMenu) mainMenu.classList.add('hidden');
           if(multiplayerMenu) multiplayerMenu.classList.add('hidden');
           if(gameApp) gameApp.classList.add('hidden');

           // Then show game
           gameApp.classList.remove('hidden');
           document.body.classList.add('multiplayer-theme');
           
           // Move history save to end and protect it
           try {
               saveRoomToHistory(currentRoomId);
           } catch (e) { console.warn("History save error:", e); }

           currentPoints = 0; 
           updateSpeechBubble(); updateBestCombo(); updateBestClaimedCombo(); scheduleIdleCta();
       }).catch((error) => {
           console.error("Firebase Error:", error);
           if (error.code === 'PERMISSION_DENIED') {
               showToast(isSpanish ? "Error: Permiso denegado (Revisa conexión)" : "Error: Permission Denied");
           } else {
               showToast(isSpanish ? "ERROR DE CONEXIÓN" : "CONNECTION ERROR");
           }
       });
  }

  function subscribeToRoom(roomId) {
      if (roomSubscription) { db.ref('rooms/' + roomId + '/players').off(); }
      roomSubscription = db.ref('rooms/' + roomId + '/players').on('value', (snapshot) => {
          const data = snapshot.val();
          if (!data) { players = []; updateLeaderboard(); return; }
          const oldPlayers = [...players];
          players = [];
          Object.keys(data).forEach(key => {
              const pData = data[key];
              const oldP = oldPlayers.find(op => op.id === key);
              players.push({
                  id: key,
                  name: pData.name || 'Unknown',
                  score: pData.score || 0,
                  bestStreak: pData.bestStreak || 0,
                  bestClaimed: pData.bestClaimed || 0,
                  isUser: (auth.currentUser && key === auth.currentUser.uid) || (!auth.currentUser && key === userId),
                  lastRank: oldP ? oldP.lastRank : 0
              });
          });
          const me = players.find(p => p.isUser);
          if (me) currentPlayerName = me.name;
          updateLeaderboard();
      });
  }

  function handleGameExit() {
      if (currentGameMode === 'story') {
          saveGameData();
          showMainMenu();
      } else {
          if (currentRoomId && roomSubscription) {
              db.ref('rooms/' + currentRoomId + '/players').off();
          }
          currentRoomId = null; currentGameMode = null;
          showMultiplayerMenu();
      }
  }

  function updateFireEffect(score) {
    fireContainer.innerHTML = ''; 
    if (score < 2) return;
    const streakLevel = Math.log2(score);
    const count = Math.floor(streakLevel * 12); 
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.textContent = '🔥'; el.className = 'fire-particle';
      const size = 1.5 + Math.random() * 2.0; el.style.fontSize = size + 'rem';
      const side = Math.floor(Math.random() * 4); 
      const offset = 10 + Math.random() * 80; const depth = (Math.random() * 10 - 5) + 'px';
      switch(side) {
          case 0: el.style.top = depth; el.style.left = offset + '%'; break;
          case 1: el.style.right = depth; el.style.top = offset + '%'; break;
          case 2: el.style.bottom = depth; el.style.left = offset + '%'; break;
          case 3: el.style.left = depth; el.style.top = offset + '%'; break;
      }
      el.style.animationDelay = (Math.random() * 1) + 's';
      fragment.appendChild(el);
    }
    fireContainer.appendChild(fragment);
  }
  function triggerSadness() {
    sadContainer.innerHTML = ''; 
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 15; i++) {
      const el = document.createElement('div');
      el.textContent = '😢'; el.className = 'sad-particle';
      el.style.left = (Math.random() * 100) + 'vw'; el.style.top = (Math.random() * 80) + 'vh'; 
      el.style.animationDuration = (0.6 + Math.random() * 0.3) + 's';
      fragment.appendChild(el);
    }
    sadContainer.appendChild(fragment);
    setTimeout(() => { sadContainer.innerHTML = ''; }, 850);
  }
  function triggerHappiness() {
    happyContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const happyEmojis = ['🤩', '😄'];
    for (let i = 0; i < 20; i++) {
      const el = document.createElement('div');
      el.textContent = happyEmojis[Math.floor(Math.random() * happyEmojis.length)];
      el.className = 'happy-particle';
      el.style.left = (Math.random() * 100) + 'vw'; el.style.top = (50 + Math.random() * 40) + 'vh';
      el.style.animationDuration = (0.8 + Math.random() * 0.4) + 's';
      fragment.appendChild(el);
    }
    happyContainer.appendChild(fragment);
    setTimeout(() => { happyContainer.innerHTML = ''; }, 1300);
  }
  function triggerStars() {
      if (!starContainer) return;
      starContainer.innerHTML = '';
      const fragment = document.createDocumentFragment();
      const starTypes = ['⭐', '🌟', '✨', '💫', '✴️', '🤩'];
      for (let i = 0; i < 50; i++) { 
          const el = document.createElement('div');
          el.textContent = starTypes[Math.floor(Math.random() * starTypes.length)];
          el.className = 'star-particle';
          const startX = 50 + (Math.random() * 20 - 10);
          const startY = 30 + (Math.random() * 20 - 10);
          const endX = (Math.random() * 100 - 50) + 'vw';
          const endY = (Math.random() * 100 - 50) + 'vh';
          el.style.left = startX + 'vw'; el.style.top = startY + 'vh';
          el.style.setProperty('--tx', (Math.random() * 40 - 20) + 'vw');
          el.style.setProperty('--ty', (Math.random() * 40 - 20) + 'vh');
          el.style.setProperty('--tx-end', endX); el.style.setProperty('--ty-end', endY);
          el.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
          fragment.appendChild(el);
      }
      starContainer.appendChild(fragment);
      setTimeout(() => { if(starContainer) starContainer.innerHTML = ''; }, 3500);
  }
  function showMilestoneCelebration(points) {
      if (!milestoneToast) return;
      const msg = isSpanish ? `¡ENHORABUENA!<br><span>${points} PUNTOS</span>` : `CONGRATULATIONS!<br><span>${points} POINTS</span>`;
      milestoneToast.innerHTML = msg; milestoneToast.classList.add('visible');
      triggerStars();
      setTimeout(() => { milestoneToast.classList.remove('visible'); }, 3000);
  }
  
  const MILESTONES = [10, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 1000];
  function checkMilestones(oldScore, newScore) {
       let highestPassed = -1;
       for (let m of MILESTONES) { if (oldScore < m && newScore >= m) { highestPassed = Math.max(highestPassed, m); } }
       if (newScore >= 1000) {
           const oldThousands = Math.floor(oldScore / 1000);
           const newThousands = Math.floor(newScore / 1000);
           if (newThousands > oldThousands && newThousands > 1) { highestPassed = Math.max(highestPassed, newThousands * 1000); }
       }
       if (highestPassed > 0) { showMilestoneCelebration(highestPassed); }
  }

  function triggerHighlight(element) {
    if (!element) return;
    element.classList.add('highlight');
    setTimeout(() => { element.classList.remove('highlight'); }, 1000);
  }

  function saveGameData() {
    if (currentGameMode !== 'story') return; 
    const user = players.find(p => p.isUser);
    const gameData = {
      userScore: user ? user.score : 0,
      bestCombo: bestCombo,
      bestClaimedCombo: bestClaimedCombo,
      playersScores: players.map(p => ({ id: p.id, score: p.score, name: p.isUser ? p.name : undefined }))
    };
    try { localStorage.setItem('coinfliip_gameData', JSON.stringify(gameData)); } catch (e) { }
  }

  function loadGameData() {
    try {
      const savedData = localStorage.getItem('coinfliip_gameData');
      if (savedData) {
        const gameData = JSON.parse(savedData);
        const user = players.find(p => p.isUser);
        if (user) {
          user.score = gameData.userScore || 0;
          if (gameData.playersScores) {
            const savedUser = gameData.playersScores.find(p => p.id === 'user');
            if (savedUser && savedUser.name) { user.name = savedUser.name; currentPlayerName = savedUser.name; }
          }
        }
        bestCombo = gameData.bestCombo || 0;
        bestClaimedCombo = gameData.bestClaimedCombo || 0;
        if (gameData.playersScores) {
          gameData.playersScores.forEach(savedPlayer => {
            const player = players.find(p => p.id === savedPlayer.id);
            if (player && !player.isUser) { player.score = savedPlayer.score || player.score; }
          });
        }
        return true;
      }
    } catch (e) { }
    return false;
  }

  function rollOutcome() {
    const r = Math.random() * P_TOTAL;
    if (r < P_HEADS) return 'cara';
    if (r < P_HEADS + P_TAILS) return 'cruz';
    return 'canto';
  }

  function showToast(message) {
    toast.textContent = message; toast.classList.add('visible');
    setTimeout(function () { toast.classList.remove('visible'); }, 1300);
  }

  function updateSpeechBubble() {
    if (currentPoints > 0) { speechBubble.hidden = false; speechBubble.textContent = String(currentPoints); } 
    else { speechBubble.hidden = true; }
  }

  function updateBestCombo() { resultPillValue.textContent = String(bestCombo); }
  function updateBestClaimedCombo() { bestClaimedValue.textContent = String(bestClaimedCombo); }

  function resetStreak() {
    currentPoints = 0; updateSpeechBubble(); updateFireEffect(0); claimButton.disabled = true;
  }

  function formatScore(score) { return score.toLocaleString('es-ES'); }

  let nameModalHandlers = null;
  function showNameModal(player) {
    const overlay = document.getElementById('nameModalOverlay');
    const input = document.getElementById('nameModalInput');
    const title = document.getElementById('nameModalTitle');
    const cancelBtn = document.getElementById('nameModalCancel');
    const saveBtn = document.getElementById('nameModalSave');
    if (!overlay) return;
    if (nameModalHandlers) {
      saveBtn.removeEventListener('click', nameModalHandlers.save);
      cancelBtn.removeEventListener('click', nameModalHandlers.cancel);
      input.removeEventListener('keydown', nameModalHandlers.keydown);
      overlay.removeEventListener('click', nameModalHandlers.overlay);
    }
    // Fix logic: If current name is reaction emoji, use stored original name for input
    // Or just use the raw name if we want to let them keep emoji (not recommended per prompt logic, but okay)
    // Actually, prompt says reaction is temporary.
    // If modal is opened, just use player.name as is.
    input.value = player.name; input.maxLength = 10;
    if (isSpanish) {
      title.textContent = 'Cambiar nombre'; cancelBtn.textContent = 'Cancelar';
      saveBtn.textContent = 'Guardar'; input.placeholder = 'Máx. 10 caracteres';
    } else {
      title.textContent = 'Change name'; cancelBtn.textContent = 'Cancel';
      saveBtn.textContent = 'Save'; input.placeholder = 'Max. 10 characters';
    }
    const handleSave = function() {
      const trimmedName = input.value.trim().substring(0, 10);
      if (trimmedName.length > 0) {
        player.name = trimmedName; currentPlayerName = trimmedName; 
        if (currentGameMode === 'story') {
           saveGameData(); updateLeaderboard();
        } else if (currentGameMode && currentGameMode.startsWith('multiplayer')) {
           if(auth.currentUser) {
               db.ref('rooms/' + currentRoomId + '/players/' + auth.currentUser.uid).update({ name: trimmedName });
           }
        }
      }
      hideNameModal();
    };
    const handleCancel = function() { hideNameModal(); };
    const handleKeyPress = function(e) {
      if (e.key === 'Enter') { e.preventDefault(); handleSave(); } 
      else if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
    };
    const handleOverlayClick = function(e) { if (e.target === overlay) handleCancel(); };
    nameModalHandlers = { save: handleSave, cancel: handleCancel, keydown: handleKeyPress, overlay: handleOverlayClick };
    saveBtn.addEventListener('click', handleSave); cancelBtn.addEventListener('click', handleCancel);
    input.addEventListener('keydown', handleKeyPress); overlay.addEventListener('click', handleOverlayClick);
    overlay.classList.add('visible');
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }
  function hideNameModal() { const overlay = document.getElementById('nameModalOverlay'); if (overlay) overlay.classList.remove('visible'); }

  // --- REACTION SYSTEM LOGIC ---
  let reactionCooldown = false;
  
  function handleReactionClick(btn, popoverId) {
      const popover = document.getElementById(popoverId);
      if (!popover) return;
      // Toggle visibility
      if (popover.classList.contains('visible')) {
          popover.classList.remove('visible');
      } else {
          // Close others if multiple (not needed here as only one user row)
          popover.classList.add('visible');
      }
  }
  
  function applyReaction(emoji) {
      if (reactionCooldown) return;
      if (!auth.currentUser || !currentRoomId) return;

      // Start cooldown
      reactionCooldown = true;
      setTimeout(() => { reactionCooldown = false; }, 1000);

      // Store original name ONLY if we are not already in a reaction state (prevents overwriting original with emoji)
      // But we might be in reaction state if user spams.
      // Best way: If originalNameBeforeReaction is null, save current name.
      if (originalNameBeforeReaction === null) {
          originalNameBeforeReaction = currentPlayerName;
      }
      
      // Hide popover
      const popover = document.querySelector('.reaction-popover.visible');
      if (popover) popover.classList.remove('visible');

      // Update Name in Firebase
      db.ref('rooms/' + currentRoomId + '/players/' + auth.currentUser.uid).update({ name: emoji });
      
      // Set Timeout to revert
      // If user clicks another emoji before 2s, we need to clear previous revert timer?
      // Yes, essentially resetting the revert clock.
      if (window.reactionRevertTimer) clearTimeout(window.reactionRevertTimer);
      
      window.reactionRevertTimer = setTimeout(() => {
          if (originalNameBeforeReaction) {
              db.ref('rooms/' + currentRoomId + '/players/' + auth.currentUser.uid).update({ name: originalNameBeforeReaction });
              originalNameBeforeReaction = null; // Reset
          }
      }, 2000);
  }

  function updateLeaderboard() {
    if (!players || players.length === 0) { leaderboardEl.innerHTML = ''; return; }
    const sorted = players.slice().sort((a, b) => b.score - a.score);
    leaderboardEl.innerHTML = '';
    let userPosition = null;
    for (let i = 0; i < sorted.length; i++) {
      const player = sorted[i];
      const currentRank = i + 1;
      const previousRank = player.lastRank;
      const row = document.createElement('div');
      row.className = 'leaderboard-row' + (player.isUser ? ' is-user' : '');
      const pos = document.createElement('div');
      pos.className = 'leaderboard-pos';
      pos.textContent = currentRank + '.';
      const name = document.createElement('div');
      name.className = 'leaderboard-name';
      const nameText = document.createElement('div');
      nameText.className = 'leaderboard-name-text';
      nameText.textContent = player.name;
      name.appendChild(nameText);
      
      if (player.isUser) {
        userPosition = currentRank; name.style.cursor = 'pointer';
        name.title = isSpanish ? 'Toca para cambiar tu nombre' : 'Click to change your name';
        // Only open name modal if clicked on text, not buttons
        nameText.addEventListener('click', function() { showNameModal(player); });
      }
      
      let trendIcon = document.createElement('span');
      trendIcon.className = 'trend-icon';
      let hasChanged = false;
      if (previousRank !== 0 && currentRank !== previousRank) {
          if (currentRank < previousRank) { trendIcon.textContent = '▲'; trendIcon.classList.add('trend-up'); } 
          else { trendIcon.textContent = '▼'; trendIcon.classList.add('trend-down'); }
          hasChanged = true;
      } else { trendIcon.textContent = ''; }
      player.lastRank = currentRank;
      name.appendChild(trendIcon);
      if (hasChanged) {
          trendIcon.classList.add('visible');
          setTimeout(() => { if (trendIcon) trendIcon.classList.remove('visible'); }, 60000);
      }
      if (player.isUser && currentGameMode === 'story') {
          const tag = document.createElement('span');
          tag.className = 'leaderboard-tag';
          tag.textContent = isSpanish ? 'Tú' : 'You';
          name.appendChild(tag);
      }
      
      // --- STATS TAGS & REACTION BUTTON ---
      if (currentGameMode === 'multiplayer' && (player.bestStreak > 0 || player.bestClaimed > 0 || player.isUser)) {
          const tagsDiv = document.createElement('div');
          tagsDiv.className = 'leaderboard-stats-tags';
          
          if (player.bestStreak > 0) {
              const fireTag = document.createElement('span');
              fireTag.className = 'stat-tag';
              fireTag.innerHTML = `🔥 ${player.bestStreak}`;
              tagsDiv.appendChild(fireTag);
          }
          if (player.bestClaimed > 0) {
              const bankTag = document.createElement('span');
              bankTag.className = 'stat-tag';
              bankTag.innerHTML = `💰 ${player.bestClaimed}`;
              tagsDiv.appendChild(bankTag);
          }
          
          // NEW: Reaction Button Logic
          if (player.isUser) {
              const reactionBtn = document.createElement('div');
              reactionBtn.className = 'reaction-trigger-btn';
              reactionBtn.textContent = '...';
              
              // Popover ID logic
              const popoverId = 'reactionPopover';
              
              reactionBtn.onclick = (e) => {
                  e.stopPropagation();
                  handleReactionClick(reactionBtn, popoverId);
              };
              
              // Create Popover (append to reactionBtn so it moves with it, or handle absolute)
              // Given the layout, we can append it to tagsDiv but need position relative on button
              // But reactionBtn is inside tagsDiv.
              
              const popover = document.createElement('div');
              popover.id = popoverId;
              popover.className = 'reaction-popover';
              
              const emojis = ['😄', '😡', '😢', '😎', '🤡'];
              emojis.forEach(emoji => {
                  const opt = document.createElement('div');
                  opt.className = 'emoji-option';
                  opt.textContent = emoji;
                  opt.onclick = (e) => {
                      e.stopPropagation();
                      applyReaction(emoji);
                  };
                  popover.appendChild(opt);
              });
              
              // Append popover to row or name container to avoid clipping issues if overflow is visible
              // Appending to reactionBtn is easiest for positioning if we adjust styles
              reactionBtn.appendChild(popover);
              tagsDiv.appendChild(reactionBtn);
          }

          name.appendChild(tagsDiv);
      }
      
      const score = document.createElement('div');
      score.className = 'leaderboard-score';
      score.textContent = formatScore(player.score);
      row.appendChild(pos); row.appendChild(name); row.appendChild(score);
      leaderboardEl.appendChild(row);
    }
    return userPosition;
  }

  function randomBotProgress(claimValue) {
    if (claimValue <= 0 || currentGameMode !== 'story') return;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.isUser) continue;
      const delta = Math.floor(Math.random() * (claimValue * 0.75));
      p.score += delta;
    }
  }

  function scheduleIdleCta() {
    if (ctaTimeoutId !== null) clearTimeout(ctaTimeoutId);
    coinFaceLabel.classList.remove('cta');
    ctaTimeoutId = setTimeout(function () { coinFaceLabel.classList.add('cta'); }, 5000);
  }

  // Coin rotation around X: 0 = heads up, 180 = tails up, 78 = balanced on its edge
  let coinRotation = 0;
  let isFlipping = false;

  function tossCoin(outcome, onLand) {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = outcome === 'cara' ? 0 : outcome === 'cruz' ? 180 : 78;
    const start = coinRotation;
    const base = start - (((start % 360) + 360) % 360);
    const end = base + (reduceMotion ? 360 : 1440) + target;
    coinRotation = end;
    if (reduceMotion || !coinBody.animate) {
      coinBody.style.transform = 'rotateX(' + end + 'deg)';
      onLand(); return;
    }
    const duration = 1000;
    const lift = 'translateY(-120px) translateZ(50px)';
    const mid = start + (end - start) * 0.5;
    const landTilt = outcome === 'canto' ? 0 : (outcome === 'cara' ? 14 : -14);
    coinBody.animate([
      { transform: 'translateY(0) translateZ(0) rotateX(' + start + 'deg)', easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
      { transform: lift + ' rotateX(' + mid + 'deg)', offset: 0.45, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
      { transform: 'translateY(0) translateZ(0) rotateX(' + (end - landTilt) + 'deg)', offset: 0.82, easing: 'ease-out' },
      { transform: 'translateY(-14px) translateZ(0) rotateX(' + (end + landTilt * 0.5) + 'deg)', offset: 0.91, easing: 'ease-in' },
      { transform: 'translateY(0) translateZ(0) rotateX(' + end + 'deg)' }
    ], { duration: duration, fill: 'forwards' });
    const landShadow = outcome === 'canto' ? 'translate(8px, 8px) scale(1, 0.3)' : 'translate(8px, 8px) scale(1)';
    const startShadow = getComputedStyle(coinShadow).transform;
    coinShadow.animate([
      { transform: startShadow === 'none' ? 'translate(8px, 8px) scale(1)' : startShadow },
      { transform: 'translate(24px, 24px) scale(0.55)', offset: 0.45 },
      { transform: landShadow, offset: 0.82 },
      { transform: landShadow }
    ], { duration: duration, fill: 'forwards' });
    setTimeout(onLand, duration * 0.82);
  }

  function handleCoinClick() {
    if (isFlipping) return;
    isFlipping = true;
    coinButton.classList.add('flipping');
    coinFaceLabel.textContent = isSpanish ? 'Lanzando...' : 'Flipping...';
    coinFaceLabel.classList.remove('cta');
    const outcome = rollOutcome();
    tossCoin(outcome, function () {
      isFlipping = false;
      coinButton.classList.remove('flipping');
      if (outcome === 'cara') {
        headsCount++;
        coinFaceLabel.textContent = isSpanish ? 'Cara' : 'Heads';
        currentPoints = currentPoints === 0 ? 1 : currentPoints * 2;
        if (currentPoints > bestCombo) {
          bestCombo = currentPoints;
          if (currentGameMode === 'story') saveGameData();
          triggerHighlight(resultPill);
          if (currentGameMode === 'multiplayer' && auth.currentUser) {
               db.ref('rooms/' + currentRoomId + '/players/' + auth.currentUser.uid).update({ bestStreak: bestCombo });
          }
        }
        claimButton.disabled = false; updateFireEffect(currentPoints);
      } else if (outcome === 'cruz') {
        tailsCount++;
        coinFaceLabel.textContent = isSpanish ? 'Cruz (reinicio)' : 'Tails (reset)';
        if (currentPoints >= 2) triggerSadness();
        resetStreak();
      } else {
        edgesCount++;
        coinFaceLabel.textContent = isSpanish ? 'Canto (raro)' : 'Edge (rare)';
        currentPoints += 50000;
        if (currentPoints > bestCombo) {
          bestCombo = currentPoints;
          if (currentGameMode === 'story') saveGameData();
          triggerHighlight(resultPill);
          if (currentGameMode === 'multiplayer' && auth.currentUser) {
               db.ref('rooms/' + currentRoomId + '/players/' + auth.currentUser.uid).update({ bestStreak: bestCombo });
          }
        }
        claimButton.disabled = false; showToast(isSpanish ? '⭐ ¡CANTO! +50000 puntos' : '⭐ EDGE! +50000 points');
        updateFireEffect(currentPoints);
      }
      totalFlips++; updateSpeechBubble(); updateBestCombo(); scheduleIdleCta();
    });
  }

  function handleClaimClick() {
    if (currentPoints <= 0) return;
    const user = players.find(p => p.isUser);
    if (!user && currentGameMode === 'story') return; 
    sendAnalyticsEvent('claim_click', { current_streak: currentPoints });
    if (currentPoints > bestClaimedCombo) { bestClaimedCombo = currentPoints; triggerHighlight(bestClaimedPill); }
    let oldScore = 0; let newScore = 0;
    if (user) { oldScore = user.score; user.score += currentPoints; newScore = user.score; }
    checkMilestones(oldScore, newScore);
    triggerHappiness();
    if (currentGameMode === 'story') {
        randomBotProgress(currentPoints); updateLeaderboard(); saveGameData();
    } else if (currentGameMode === 'multiplayer' && auth.currentUser) {
        db.ref('rooms/' + currentRoomId + '/players/' + auth.currentUser.uid).update({
            score: newScore, bestClaimed: bestClaimedCombo
        });
    }
    const pointsText = isSpanish ? (currentPoints === 1 ? ' punto' : ' puntos') : (currentPoints === 1 ? ' point' : ' points');
    showToast(isSpanish ? 'Has cobrado ' + currentPoints + pointsText : 'You claimed ' + currentPoints + pointsText);
    resetStreak();
    coinFaceLabel.innerHTML = isSpanish ? '<strong>Toca para lanzar</strong>' : '<strong>Tap to flip</strong>';
    scheduleIdleCta();
    updateBestClaimedCombo();
  }
  
  roomCodeDisplay.addEventListener('click', () => {
       const textToCopy = currentRoomId;
       const textArea = document.createElement("textarea");
       textArea.value = textToCopy; textArea.style.position = "fixed"; textArea.style.opacity = "0";
       document.body.appendChild(textArea); textArea.select();
       try {
           const successful = document.execCommand('copy');
           if(successful) {
               const originalText = roomCodeDisplay.textContent;
               roomCodeDisplay.textContent = isSpanish ? 'COPIADO!' : 'COPIED!';
               setTimeout(() => { roomCodeDisplay.textContent = originalText; }, 1500);
           }
       } catch (err) {}
       document.body.removeChild(textArea);
  });

  if (btnShareRoom) btnShareRoom.addEventListener('click', showShareModal);

  coinButton.addEventListener('click', handleCoinClick);
  claimButton.addEventListener('click', handleClaimClick);
  
  btnStoryMode.addEventListener('click', () => startGame('story'));
  btnMultiplayerMenu.addEventListener('click', showMultiplayerMenu);
  btnBackToMain.addEventListener('click', showMainMenu);
  btnCreateRoom.addEventListener('click', () => {
       const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
       let code = '';
       for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
       joinRoom(code);
  });
  btnJoinRoom.addEventListener('click', () => {
      const code = roomCodeInput.value.trim().toUpperCase();
      if (code) joinRoom(code);
  });
  btnGameExit.addEventListener('click', handleGameExit);

  const instagramLink = document.querySelector('.social-link[href*="instagram"]');
  const donateLink = document.querySelector('.social-link[href*="paypal"]');
  if (instagramLink) instagramLink.addEventListener('click', function() { sendAnalyticsEvent('social_click', { social_platform: 'instagram' }); });
  if (donateLink) donateLink.addEventListener('click', function() { sendAnalyticsEvent('social_click', { social_platform: 'donate' }); });

  document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
          const item = header.parentElement;
          const isActive = item.classList.contains('active');
          if (!isActive) { item.classList.add('active'); header.setAttribute('aria-expanded', 'true'); } 
          else { item.classList.remove('active'); header.setAttribute('aria-expanded', 'false'); }
      });
  });
  
  // Hide popover if clicking outside
  document.addEventListener('click', function(e) {
      const popovers = document.querySelectorAll('.reaction-popover.visible');
      popovers.forEach(p => {
          // If click is not inside the reaction button (parent of popover in DOM logic)
          // Note: since popover is child of button in my JS structure above, checking if button contains target works
          // But e.target logic needs care.
          // Simpler: Just hide all visible popovers unless e.target is the specific trigger button
          // But the trigger logic stops propagation.
          p.classList.remove('visible');
      });
  });
})();
