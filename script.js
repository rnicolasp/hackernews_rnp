const BASE_URL = 'https://hacker-news.firebaseio.com/v0';

const estado = {
  currentIds: [],
  page: 0,
  itemsPerPage: 10,
  pollingInterval: null,
  pollingItems: new Set(),
  pollingUsers: new Set()
};

const appDiv = document.getElementById('app');
const cargaDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const navLinks = document.querySelectorAll('nav a');

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

async function router() {
  stopPolling();
  appDiv.innerHTML = '';
  estado.pollingItems.clear();
  estado.pollingUsers.clear();

  const hash = window.location.hash.slice(1) || 'top';

  navLinks.forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${hash}` || (hash === '' && a.getAttribute('href') === '#top'));
  });

  if (hash.startsWith('user=')) {
    const userId = hash.split('=')[1];
    await renderUser(userId);
  } else if (hash.startsWith('story=')) {
    const storyId = hash.split('=')[1];
    await renderStoryView(storyId);
  } else {
    const type = ['top', 'new', 'best'].includes(hash) ? hash : 'top';
    await renderFeed(type);
  }

  startPolling();
}

async function fetchJson(path) {
  try {
    clearError();
    const res = await fetch(`${BASE_URL}/${path}.json`);
    if (!res.ok) {
      showError('Error al obtener datos (HTTP ' + res.status + ').');
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Error fetching', path, err);
    showError('Error de red al cargar datos. Comprueba tu conexión.');
    return null;
  }
}

let _errorTimeout = null;
function showError(msg) {
  if (!errorDiv) return;
  errorDiv.textContent = msg;
  errorDiv.hidden = false;
  errorDiv.classList.add('visible');
  if (_errorTimeout) clearTimeout(_errorTimeout);
  _errorTimeout = setTimeout(() => clearError(), 7000);
}
function clearError() {
  if (!errorDiv) return;
  errorDiv.classList.remove('visible');
  errorDiv.hidden = true;
  errorDiv.textContent = '';
  if (_errorTimeout) { clearTimeout(_errorTimeout); _errorTimeout = null; }
}

function startPolling() {
  estado.pollingInterval = setInterval(async () => {
    if (estado.pollingItems.size === 0) return;
    const idsToCheck = Array.from(estado.pollingItems);
    const promises = idsToCheck.map(id => fetchJson(`item/${id}`));
    const freshItems = await Promise.all(promises);
    freshItems.forEach(newItem => {
      if (!newItem) return;
      updateItemInDOM(newItem);
    });

    if (estado.pollingUsers.size > 0) {
      const usersToCheck = Array.from(estado.pollingUsers);
      const userPromises = usersToCheck.map(id => fetchJson(`user/${id}`));
      const freshUsers = await Promise.all(userPromises);
      freshUsers.forEach(u => { if (u) updateUserInDOM(u); });
    }
  }, 5000);
}

function stopPolling() {
  if (estado.pollingInterval) clearInterval(estado.pollingInterval);
}

function updateItemInDOM(item) {
  const scoreEl = document.getElementById(`score-${item.id}`);
  const commentsEl = document.getElementById(`comments-${item.id}`);

  if (scoreEl) {
    const oldScore = parseInt(scoreEl.innerText);
    if (oldScore !== item.score) {
      scoreEl.innerText = `${item.score} puntos`;
      scoreEl.parentElement.classList.add('updated');
      setTimeout(() => scoreEl.parentElement.classList.remove('updated'), 1000);
    }
  }

  if (commentsEl) {
    const oldComments = parseInt(commentsEl.innerText) || 0;
    const newComments = item.descendants || 0;
    if (oldComments !== newComments) {
      commentsEl.innerText = `${newComments} comentarios`;
      commentsEl.classList.add('updated');
    }
  }
}

async function renderFeed(type) {
  cargaDiv.classList.add('visible');
  estado.page = 0;
  estado.currentIds = await fetchJson(`${type}stories`);
  cargaDiv.classList.remove('visible');

  if (!estado.currentIds) {
    showError('No se pudieron cargar las historias. Intenta recargar.');
    return;
  }

  const contenedorLista = document.createElement('div');
  contenedorLista.id = 'story-list';
  appDiv.appendChild(contenedorLista);

  const botonCargar = document.createElement('button');
  botonCargar.className = 'btn-load';
  botonCargar.innerText = 'Cargar 10 más';
  botonCargar.onclick = () => loadNextBatch(contenedorLista, botonCargar);
  appDiv.appendChild(botonCargar);

  await loadNextBatch(contenedorLista, botonCargar);
}

async function loadNextBatch(container, botonCargar) {
  cargaDiv.classList.add('visible');
  const start = estado.page * estado.itemsPerPage;
  const end = start + estado.itemsPerPage;
  const ids = estado.currentIds.slice(start, end);

  if (!ids || ids.length === 0) {
    if (botonCargar) {
      botonCargar.disabled = true;
      botonCargar.innerText = 'No hay más historias';
    }
    cargaDiv.classList.remove('visible');
    return;
  }

  const promises = ids.map(id => fetchJson(`item/${id}`));
  const historias = await Promise.all(promises);

  historias.forEach(story => {
    if (!story) return;
    estado.pollingItems.add(story.id);
    container.appendChild(createStoryElement(story));
  });

  estado.page++;

  if (estado.page * estado.itemsPerPage >= (estado.currentIds ? estado.currentIds.length : 0)) {
    if (botonCargar) {
      botonCargar.disabled = true;
      botonCargar.innerText = 'No hay más historias';
    }
  }

  cargaDiv.classList.remove('visible');
}

function createStoryElement(story) {
  const div = document.createElement('div');
  div.className = 'story-item';
  div.innerHTML = `
    <a href="${story.url || `hash#story=${story.id}`}" class="story-title" target="_blank" rel="noopener noreferrer">${story.title}</a>
    <div class="meta">
      <span id="score-${story.id}">${story.score} puntos</span>
      por <a href="#user=${story.by}">${story.by}</a>
      el ${new Date(story.time * 1000).toLocaleString()} |
      <a href="#story=${story.id}" id="comments-${story.id}">${story.descendants || 0} comentarios</a>
    </div>
  `;
  return div;
}

async function renderStoryView(id) {
  cargaDiv.classList.add('visible');
  const story = await fetchJson(`item/${id}`);
  cargaDiv.classList.remove('visible');

  if (!story) return;
  estado.pollingItems.add(story.id);

  const header = document.createElement('div');
  header.style.marginBottom = '20px';
  header.innerHTML = `
    <h2>${story.title}</h2>
    <div class="meta">
      <span id="score-${story.id}">${story.score} puntos</span> por ${story.by} |
      <a href="${story.url}" target="_blank" rel="noopener noreferrer">Enlace original</a>
    </div>
    <hr>
  `;
  appDiv.appendChild(header);

  const commentsContainer = document.createElement('div');
  appDiv.appendChild(commentsContainer);

  if (story.kids) {
    cargaDiv.classList.add('visible');
    await loadComments(story.kids, commentsContainer);
    cargaDiv.classList.remove('visible');
  }
}

async function loadComments(ids, container) {
  const promises = ids.map(id => fetchJson(`item/${id}`));
  const comentarios = await Promise.all(promises);

  for (const comentario of comentarios) {
    if (!comentario || comentario.deleted || comentario.dead) continue;

    const comentarioEl = document.createElement('div');
    comentarioEl.className = 'comment';
    comentarioEl.innerHTML = `
      <div class="meta">
        ▲ <a href="#user=${comentario.by}">${comentario.by}</a>
        ${new Date(comentario.time * 1000).toLocaleTimeString()}
      </div>
      <div class="comment-text" id="comment-text-${comentario.id}">${comentario.text || ''}</div>
      <div class="comment-children" id="kids-${comentario.id}"></div>
    `;
    container.appendChild(comentarioEl);

    estado.pollingItems.add(comentario.id);

    if (comentario.kids && comentario.kids.length > 0) {
      loadComments(comentario.kids, comentarioEl.querySelector(`#kids-${comentario.id}`));
    }
  }
}

async function renderUser(userId) {
  cargaDiv.classList.add('visible');
  const usuario = await fetchJson(`user/${userId}`);
  cargaDiv.classList.remove('visible');

  if (!usuario) {
    appDiv.innerHTML = 'Usuario no encontrado';
    return;
  }
  appDiv.innerHTML = `
    <h1>Usuario: ${usuario.id}</h1>
    <div>Creado: ${new Date(usuario.created * 1000).toLocaleDateString()}</div>
    <div>Karma: <b id="user-karma-${usuario.id}">${usuario.karma}</b></div>
    <br>
    <div id="user-about-${usuario.id}" style="color: #444; font-style: italic;">${usuario.about || 'Sin descripción.'}</div>
  `;

  estado.pollingUsers.add(usuario.id);
}

function updateUserInDOM(usuario) {
  if (!usuario) return;
  const karmaEl = document.getElementById(`user-karma-${usuario.id}`);
  const aboutEl = document.getElementById(`user-about-${usuario.id}`);
  if (karmaEl && String(karmaEl.innerText) !== String(usuario.karma)) {
    karmaEl.innerText = usuario.karma;
  }
  if (aboutEl && (aboutEl.innerText || '') !== (usuario.about || '')) {
    aboutEl.innerText = usuario.about || 'Sin descripción.';
  }
}
