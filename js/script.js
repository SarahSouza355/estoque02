// ========================================
// 1. ELEMENTOS DO HTML & HELPERS
// ========================================

function $(id) {
    return document.querySelector(id);
}

// Elementos do Login
const telaLogin = $('#tela-login');
const formLogin = $('#form-login');
const loginEmail = $('#login-email');
const loginSenha = $('#login-senha');
const loginErro = $('#login-erro');
const btnCadastroUsuario = $('#btn-cadastro-usuario');
const app = $('#app');
const btnSair = $('#btn-sair');
const usuarioEmailEl = $('#usuario-email');

// Elementos do App
const formulario = $('#form-cadastro');
const listaPecas = $('#lista-pecas');
const listaPastas = $('#lista-pastas');
const botaoPasta = $('#criar-pasta');
const seletorPasta = $('#pasta');
const busca = $('#busca');
const corInput = $('#cor');
const corHexInput = $('#cor-hex');
const corHistorico = $('#cor-historico');
const listaLoja = $('#lista-loja');
const listaEstoque = $('#lista-estoque');
const listaLojaVisao = $('#lista-loja-visao');
const listaEstoqueVisao = $('#lista-estoque-visao');
const listaCategorias = $('#lista-categorias');
const totalPecas = $('#total-pecas');
const pecasAtivas = $('#pecas-ativas');
const pecasInativas = $('#pecas-inativas');
const botaoMenu = $('#botao-menu');

// Elementos de Tags
const tagsInput = $('#tags-input');
const tagsLista = $('#tags-lista');
const tagsHidden = $('#tags');
const tagsSugestoes = $('#tags-sugestoes');

// Estado
let usuarioAtual = null;
let pecas = [];
let pastas = [];
let unsubPecas = null;
let unsubPastas = null;
const MAX_CORES_HISTORICO = 12;

// Tags state
let tagsAtuais = []; // Tags da peça sendo editada/cadastrada
let todasTags = [];  // Todas as tags únicas do usuário (para sugestões)

// ========================================
// 2. AUTENTICAÇÃO FIREBASE
// ========================================

// Observador de estado de auth
auth.onAuthStateChanged(async (user) => {
    if (user) {
        usuarioAtual = user;
        usuarioEmailEl.textContent = user.email;
        telaLogin.classList.add('oculto');
        app.classList.remove('oculto');
        await iniciarListeners();
        atualizarSistema();
    } else {
        usuarioAtual = null;
        limparListeners();
        pecas = [];
        pastas = [];
        telaLogin.classList.remove('oculto');
        app.classList.add('oculto');
        limparUI();
    }
});

// Login
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginErro.textContent = '';
        try {
            await auth.signInWithEmailAndPassword(loginEmail.value.trim(), loginSenha.value);
        } catch (err) {
            loginErro.textContent = traduzirErroAuth(err.code);
        }
    });
}

// Cadastro de novo usuário
if (btnCadastroUsuario) {
    btnCadastroUsuario.addEventListener('click', async () => {
        const email = prompt('Email para nova conta:');
        if (!email) return;
        const senha = prompt('Senha (mín. 6 caracteres):');
        if (!senha || senha.length < 6) {
            alert('Senha deve ter pelo menos 6 caracteres');
            return;
        }
        loginErro.textContent = '';
        try {
            await auth.createUserWithEmailAndPassword(email.trim(), senha);
        } catch (err) {
            loginErro.textContent = traduzirErroAuth(err.code);
        }
    });
}

// Logout
if (btnSair) {
    btnSair.addEventListener('click', () => auth.signOut());
}

function traduzirErroAuth(code) {
    const erros = {
        'auth/invalid-email': 'Email inválido',
        'auth/user-disabled': 'Conta desativada',
        'auth/user-not-found': 'Usuário não encontrado',
        'auth/wrong-password': 'Senha incorreta',
        'auth/email-already-in-use': 'Email já cadastrado',
        'auth/weak-password': 'Senha muito fraca (mín. 6 caracteres)',
        'auth/network-request-failed': 'Sem conexão com a internet',
    };
    return erros[code] || 'Erro ao autenticar: ' + code;
}

// ========================================
// 3. FIRESTORE LISTENERS (TEMPO REAL)
// ========================================

function refPecas() {
    return db.collection('usuarios').doc(usuarioAtual.uid).collection('pecas');
}

function refPastas() {
    return db.collection('usuarios').doc(usuarioAtual.uid).collection('pastas');
}

async function iniciarListeners() {
    // Listener de peças (tempo real)
    unsubPecas = refPecas().orderBy('criadoEm', 'desc').onSnapshot((snapshot) => {
        pecas = [];
        snapshot.forEach((doc) => {
            pecas.push({ id: doc.id, ...doc.data() });
        });
        atualizarSistema();
    }, (err) => console.error('Erro ao ouvir peças:', err));

    // Listener de pastas (tempo real)
    unsubPastas = refPastas().orderBy('nome').onSnapshot((snapshot) => {
        pastas = [];
        snapshot.forEach((doc) => {
            pastas.push({ id: doc.id, ...doc.data() });
        });
        atualizarOpcoesPastas();
        mostrarPastas();
    }, (err) => console.error('Erro ao ouvir pastas:', err));
}

function limparListeners() {
    if (unsubPecas) { unsubPecas(); unsubPecas = null; }
    if (unsubPastas) { unsubPastas(); unsubPastas = null; }
}

// ========================================
// 4. HISTÓRICO DE CORES (localStorage - só visual)
// ========================================

function obterHistoricoCores() {
    return JSON.parse(localStorage.getItem('coresHistorico')) || [];
}

function salvarCorNoHistorico(cor) {
    if (!cor || !cor.startsWith('#')) return;
    const historico = obterHistoricoCores();
    const filtrado = historico.filter(c => c.toLowerCase() !== cor.toLowerCase());
    filtrado.unshift(cor.toUpperCase());
    if (filtrado.length > MAX_CORES_HISTORICO) filtrado.length = MAX_CORES_HISTORICO;
    localStorage.setItem('coresHistorico', JSON.stringify(filtrado));
    renderizarHistoricoCores();
}

function renderizarHistoricoCores() {
    if (!corHistorico) return;
    const historico = obterHistoricoCores();
    corHistorico.innerHTML = '';
    if (historico.length === 0) {
        corHistorico.innerHTML = '<span class="cor-historico-vazio">Nenhuma cor usada ainda</span>';
        return;
    }
    historico.forEach(cor => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cor-historico-item';
        btn.style.backgroundColor = cor;
        btn.title = cor;
        btn.setAttribute('aria-label', `Usar cor ${cor}`);
        btn.addEventListener('click', () => {
            corInput.value = cor;
            corHexInput.value = cor.toUpperCase();
        });
        corHistorico.appendChild(btn);
    });
}

// Sincroniza color picker <-> hex
if (corInput && corHexInput) {
    corInput.addEventListener('input', () => {
        corHexInput.value = corInput.value.toUpperCase();
    });
    corHexInput.addEventListener('input', () => {
        const v = corHexInput.value.trim();
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
            corInput.value = v;
        }
    });
}

// ========================================
// 5. TAGS / PALAVRAS-CHAVE
// ========================================

// Atualiza lista de todas as tags únicas do usuário
function atualizarTodasTags() {
    const setTags = new Set();
    pecas.forEach(peca => {
        if (peca.tags && Array.isArray(peca.tags)) {
            peca.tags.forEach(tag => setTags.add(tag.toLowerCase()));
        }
    });
    todasTags = Array.from(setTags).sort();
}

// Renderiza tags atuais no input
function renderizarTagsAtuais() {
    if (!tagsLista || !tagsHidden) return;
    tagsLista.innerHTML = '';
    tagsAtuais.forEach((tag, index) => {
        const span = document.createElement('span');
        span.className = 'tag-item';
        span.innerHTML = `${tag}<button type="button" aria-label="Remover ${tag}">&times;</button>`;
        span.querySelector('button').addEventListener('click', () => removerTag(index));
        tagsLista.appendChild(span);
    });
    // Atualiza input hidden com JSON
    tagsHidden.value = JSON.stringify(tagsAtuais);
}

// Adiciona tag
function adicionarTag(tag) {
    const tagLower = tag.trim().toLowerCase();
    if (!tagLower) return;
    if (tagsAtuais.some(t => t.toLowerCase() === tagLower)) return;
    if (tagsAtuais.length >= 20) return; // Limite de 20 tags
    tagsAtuais.push(tagLower);
    renderizarTagsAtuais();
    esconderSugestoes();
}

// Remove tag por índice
function removerTag(index) {
    tagsAtuais.splice(index, 1);
    renderizarTagsAtuais();
}

// Mostra sugestões baseadas no que o usuário digitou
function mostrarSugestoes(valor) {
    if (!tagsSugestoes || !tagsInput) return;
    const termo = valor.trim().toLowerCase();
    if (!termo) {
        esconderSugestoes();
        return;
    }
    const sugestoes = todasTags
        .filter(tag => tag.includes(termo) && !tagsAtuais.some(t => t.toLowerCase() === tag))
        .slice(0, 10);
    if (sugestoes.length === 0) {
        esconderSugestoes();
        return;
    }
    tagsSugestoes.innerHTML = '';
    sugestoes.forEach(tag => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = tag;
        btn.addEventListener('click', () => {
            adicionarTag(tag);
            tagsInput.value = '';
            tagsInput.focus();
        });
        tagsSugestoes.appendChild(btn);
    });
    tagsSugestoes.classList.add('visivel');
}

function esconderSugestoes() {
    if (tagsSugestoes) tagsSugestoes.classList.remove('visivel');
}

// Event listeners para tags
if (tagsInput) {
    tagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            adicionarTag(tagsInput.value);
            tagsInput.value = '';
        } else if (e.key === 'Escape') {
            esconderSugestoes();
        }
    });
    tagsInput.addEventListener('input', (e) => {
        mostrarSugestoes(e.target.value);
    });
    tagsInput.addEventListener('blur', () => {
        // Delay para permitir clique na sugestão
        setTimeout(esconderSugestoes, 200);
    });
    tagsInput.addEventListener('focus', () => {
        mostrarSugestoes(tagsInput.value);
    });
}

// Clica fora para fechar sugestões
document.addEventListener('click', (e) => {
    if (tagsSugestoes && tagsInput && !tagsSugestoes.contains(e.target) && e.target !== tagsInput) {
        esconderSugestoes();
    }
});

// ========================================
// 6. CADASTRO DE PEÇAS
// ========================================

if (formulario) {
    formulario.addEventListener('submit', async (e) => {
        e.preventDefault();

        const corSelecionada = corInput?.value || corHexInput?.value || '#303536';

        const novaPeca = {
            nome: $('#nome')?.value.trim() || '',
            marca: $('#marca')?.value.trim() || '',
            tamanho: $('#tamanho')?.value.trim() || '',
            cor: corSelecionada.toUpperCase(),
            categoria: $('#categoria')?.value.trim() || '',
            material: $('#material')?.value.trim() || '',
            preco: Number($('#preco')?.value) || 0,
            desconto: Number($('#desconto')?.value) || 0,
            status: $('#status')?.value || 'ativa',
            classificacao: $('#classificacao')?.value || 'loja',
            pasta: seletorPasta?.value || '',
            tags: [...tagsAtuais], // Copia as tags atuais
            criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        };

        salvarCorNoHistorico(corSelecionada);

        try {
            await refPecas().add(novaPeca);
            formulario.reset();
            corInput.value = '#303536';
            corHexInput.value = '#303536';
            // Reset tags
            tagsAtuais = [];
            renderizarTagsAtuais();
        } catch (err) {
            console.error('Erro ao salvar peça:', err);
            alert('Erro ao salvar. Verifique sua conexão.');
        }
    });
}

// ========================================
// 6. CÁLCULO DO PREÇO COM DESCONTO
// ========================================

function calcularPreco(preco, desconto) {
    const valorDesconto = preco * (desconto / 100);
    return preco - valorDesconto;
}

// ========================================
// 7. MODAL DE EDIÇÃO
// ========================================

function abrirModalEdicao(peca) {
    const modal = document.createElement('div');
    modal.className = 'modal-edicao';
    modal.innerHTML = `
        <div class="modal-conteudo">
            <h2>Editar Peça</h2>
            <form id="form-edicao">
                <input type="hidden" id="edicao-id" value="${peca.id}">

                <label for="edicao-nome">Nome da peça *</label>
                <input type="text" id="edicao-nome" value="${peca.nome}" required>

                <label for="edicao-marca">Marca</label>
                <input type="text" id="edicao-marca" value="${peca.marca || ''}">

                <label for="edicao-tamanho">Tamanho</label>
                <input type="text" id="edicao-tamanho" value="${peca.tamanho || ''}">

                <label for="edicao-cor">Cor</label>
                <input type="text" id="edicao-cor" value="${peca.cor || ''}">

                <label for="edicao-categoria">Categoria</label>
                <input type="text" id="edicao-categoria" value="${peca.categoria || ''}">

                <label for="edicao-material">Material</label>
                <input type="text" id="edicao-material" value="${peca.material || ''}">

                <label for="edicao-tags">Palavras-chave / Tags</label>
                <div class="tags-input-wrapper">
                    <input type="text" id="edicao-tags-input" placeholder="Digite e pressione Enter para adicionar" autocomplete="off">
                    <div id="edicao-tags-lista" class="tags-lista"></div>
                    <div id="edicao-tags-sugestoes" class="tags-sugestoes"></div>
                </div>
                <input type="hidden" id="edicao-tags" name="tags" value="${JSON.stringify(peca.tags || [])}">

                <label for="edicao-preco">Preço atual</label>
                <input type="number" id="edicao-preco" min="0" step="0.01" value="${peca.preco || 0}">

                <label for="edicao-desconto">Desconto (%)</label>
                <input type="number" id="edicao-desconto" min="0" max="100" value="${peca.desconto || 0}">

                <label for="edicao-status">Status</label>
                <select id="edicao-status">
                    <option value="ativa" ${peca.status === 'ativa' ? 'selected' : ''}>Ativa</option>
                    <option value="inativa" ${peca.status === 'inativa' ? 'selected' : ''}>Inativa</option>
                </select>

                <label for="edicao-classificacao">Classificação</label>
                <select id="edicao-classificacao">
                    <option value="loja" ${peca.classificacao === 'loja' ? 'selected' : ''}>Loja</option>
                    <option value="estoque" ${peca.classificacao === 'estoque' ? 'selected' : ''}>Estoque</option>
                </select>

                <label for="edicao-pasta">Pasta</label>
                <select id="edicao-pasta">
                    <option value="">Nenhuma pasta</option>
                </select>

                <div class="modal-botoes">
                    <button type="button" id="btn-cancelar-edicao">Cancelar</button>
                    <button type="submit">Salvar alterações</button>
                </div>
            </form>
        </div>
    `;

    // Preenche pastas no select
    const selectPasta = modal.querySelector('#edicao-pasta');
    pastas.forEach(pasta => {
        const opcao = document.createElement('option');
        opcao.value = pasta.id;
        opcao.textContent = pasta.nome;
        if (peca.pasta === pasta.id) opcao.selected = true;
        selectPasta.appendChild(opcao);
    });

    document.body.appendChild(modal);
    modal.querySelector('#edicao-nome').focus();

    // Inicializa tags do modal de edição
    inicializarTagsEdicao(peca);

    // Fecha clicando fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) fecharModal(modal);
    });

    // Botão cancelar
    modal.querySelector('#btn-cancelar-edicao').addEventListener('click', () => fecharModal(modal));

    // Submit
    modal.querySelector('#form-edicao').addEventListener('submit', (e) => {
        e.preventDefault();
        salvarEdicao(peca.id, modal);
    });

    // ESC
    function fecharComEsc(e) {
        if (e.key === 'Escape') {
            fecharModal(modal);
            document.removeEventListener('keydown', fecharComEsc);
        }
    }
    document.addEventListener('keydown', fecharComEsc);
}

function fecharModal(modal) {
    modal.remove();
}

// Inicializa tags no modal de edição
function inicializarTagsEdicao(peca) {
    const edicaoTagsInput = document.querySelector('#edicao-tags-input');
    const edicaoTagsLista = document.querySelector('#edicao-tags-lista');
    const edicaoTagsHidden = document.querySelector('#edicao-tags');
    const edicaoTagsSugestoes = document.querySelector('#edicao-tags-sugestoes');

    if (!edicaoTagsInput || !edicaoTagsLista || !edicaoTagsHidden) return;

    // Carrega tags da peça
    tagsAtuais = (peca.tags && Array.isArray(peca.tags)) ? [...peca.tags] : [];
    renderizarTagsEdicao();

    function renderizarTagsEdicao() {
        edicaoTagsLista.innerHTML = '';
        tagsAtuais.forEach((tag, index) => {
            const span = document.createElement('span');
            span.className = 'tag-item';
            span.innerHTML = `${tag}<button type="button" aria-label="Remover ${tag}">&times;</button>`;
            span.querySelector('button').addEventListener('click', () => {
                tagsAtuais.splice(index, 1);
                renderizarTagsEdicao();
                atualizarEdicaoTagsHidden();
                esconderSugestoesEdicao();
            });
            edicaoTagsLista.appendChild(span);
        });
        atualizarEdicaoTagsHidden();
    }

    function atualizarEdicaoTagsHidden() {
        edicaoTagsHidden.value = JSON.stringify(tagsAtuais);
    }

    function mostrarSugestoesEdicao(valor) {
        if (!edicaoTagsSugestoes || !edicaoTagsInput) return;
        const termo = valor.trim().toLowerCase();
        if (!termo) {
            esconderSugestoesEdicao();
            return;
        }
        const sugestoes = todasTags
            .filter(tag => tag.includes(termo) && !tagsAtuais.some(t => t.toLowerCase() === tag))
            .slice(0, 10);
        if (sugestoes.length === 0) {
            esconderSugestoesEdicao();
            return;
        }
        edicaoTagsSugestoes.innerHTML = '';
        sugestoes.forEach(tag => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = tag;
            btn.addEventListener('click', () => {
                adicionarTagEdicao(tag);
                edicaoTagsInput.value = '';
                edicaoTagsInput.focus();
            });
            edicaoTagsSugestoes.appendChild(btn);
        });
        edicaoTagsSugestoes.classList.add('visivel');
    }

    function esconderSugestoesEdicao() {
        if (edicaoTagsSugestoes) edicaoTagsSugestoes.classList.remove('visivel');
    }

    function adicionarTagEdicao(tag) {
        const tagLower = tag.trim().toLowerCase();
        if (!tagLower) return;
        if (tagsAtuais.some(t => t.toLowerCase() === tagLower)) return;
        if (tagsAtuais.length >= 20) return;
        tagsAtuais.push(tagLower);
        renderizarTagsEdicao();
        esconderSugestoesEdicao();
    }

    // Event listeners
    edicaoTagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            adicionarTagEdicao(edicaoTagsInput.value);
            edicaoTagsInput.value = '';
        } else if (e.key === 'Escape') {
            esconderSugestoesEdicao();
        }
    });
    edicaoTagsInput.addEventListener('input', (e) => {
        mostrarSugestoesEdicao(e.target.value);
    });
    edicaoTagsInput.addEventListener('blur', () => {
        setTimeout(esconderSugestoesEdicao, 200);
    });
    edicaoTagsInput.addEventListener('focus', () => {
        mostrarSugestoesEdicao(edicaoTagsInput.value);
    });

    // Clica fora para fechar
    document.addEventListener('click', (e) => {
        if (edicaoTagsSugestoes && edicaoTagsInput && !edicaoTagsSugestoes.contains(e.target) && e.target !== edicaoTagsInput) {
            esconderSugestoesEdicao();
        }
    });
}

async function salvarEdicao(id, modal) {
    try {
        // Obtém tags do hidden input do modal
        const tagsHidden = modal.querySelector('#edicao-tags');
        const tags = tagsHidden ? JSON.parse(tagsHidden.value || '[]') : [];

        await refPecas().doc(id).update({
            nome: modal.querySelector('#edicao-nome').value.trim(),
            marca: modal.querySelector('#edicao-marca').value.trim(),
            tamanho: modal.querySelector('#edicao-tamanho').value.trim(),
            cor: modal.querySelector('#edicao-cor').value.trim(),
            categoria: modal.querySelector('#edicao-categoria').value.trim(),
            material: modal.querySelector('#edicao-material').value.trim(),
            preco: Number(modal.querySelector('#edicao-preco').value),
            desconto: Number(modal.querySelector('#edicao-desconto').value),
            status: modal.querySelector('#edicao-status').value,
            classificacao: modal.querySelector('#edicao-classificacao').value,
            pasta: modal.querySelector('#edicao-pasta').value,
            tags: tags,
        });
        fecharModal(modal);
    } catch (err) {
        console.error('Erro ao atualizar:', err);
        alert('Erro ao salvar alterações');
    }
}

// ========================================
// 8. EXIBIR PEÇAS (CARDS COLAPSÍVEIS)
// ========================================

/**
 * Cria um card completo de peça (reutilizável)
 * @param {Object} peca - Objeto da peça
 * @returns {HTMLElement} Elemento <article> do card
 */
function criarCartaoPeca(peca) {
    const cartao = document.createElement('article');
    cartao.className = 'cartao-peca';
    cartao.dataset.id = peca.id;

    // Cabeçalho
    const cabecalho = document.createElement('div');
    cabecalho.className = 'cartao-cabecalho';

    const tituloContainer = document.createElement('div');
    tituloContainer.className = 'cartao-titulo-container';

    if (peca.cor) {
        const corBolinha = document.createElement('span');
        corBolinha.className = 'cartao-cor-bolinha';
        corBolinha.style.backgroundColor = peca.cor;
        corBolinha.title = peca.cor;
        tituloContainer.appendChild(corBolinha);
    }

    const titulo = document.createElement('h3');
    const tamanhoTexto = peca.tamanho ? ` ${peca.tamanho}` : '';
    titulo.textContent = peca.nome + tamanhoTexto;
    tituloContainer.appendChild(titulo);

    cabecalho.appendChild(tituloContainer);

    const toggle = document.createElement('button');
    toggle.className = 'cartao-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Mostrar detalhes');
    toggle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    cabecalho.appendChild(toggle);

    cartao.appendChild(cabecalho);

    // Tags visíveis no card
    if (peca.tags && Array.isArray(peca.tags) && peca.tags.length > 0) {
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'cartao-tags';
        peca.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'cartao-tag';
            tagEl.textContent = tag;
            tagsContainer.appendChild(tagEl);
        });
        cartao.appendChild(tagsContainer);
    }

    // Detalhes (inicialmente escondido)
    const detalhes = document.createElement('div');
    detalhes.className = 'cartao-detalhes';
    detalhes.hidden = true;

    const precoFinal = calcularPreco(peca.preco || 0, peca.desconto || 0);
    const temDesconto = (peca.desconto || 0) > 0;

    const linhas = [
        { label: 'Marca', valor: peca.marca || '—' },
        { label: 'Categoria', valor: peca.categoria || '—' },
        { label: 'Material', valor: peca.material || '—' },
        { label: 'Cor', valor: peca.cor || '—' },
        { label: 'Tamanho', valor: peca.tamanho || '—' },
        { label: 'Status', valor: peca.status === 'ativa' ? 'Ativa' : 'Inativa', classe: `status-${peca.status}` },
        { label: 'Classificação', valor: peca.classificacao === 'loja' ? 'Loja' : 'Estoque' },
        { label: 'Pasta', valor: getPastaNome(peca.pasta) || '—' },
    ];

    if (temDesconto) {
        linhas.push(
            { label: 'Preço original', valor: `R$ ${(peca.preco || 0).toFixed(2).replace('.', ',')}` },
            { label: 'Desconto', valor: `${peca.desconto}%` },
            { label: 'Preço final', valor: `R$ ${precoFinal.toFixed(2).replace('.', ',')}`, destaque: true }
        );
    } else {
        linhas.push({ label: 'Preço', valor: `R$ ${(peca.preco || 0).toFixed(2).replace('.', ',')}` });
    }

    linhas.forEach(l => {
        const div = document.createElement('div');
        div.className = 'detalhe-linha';
        if (l.destaque) div.style.fontWeight = '700';
        div.innerHTML = `<span class="detalhe-label">${l.label}</span><span class="detalhe-valor ${l.classe || ''}">${l.valor}</span>`;
        detalhes.appendChild(div);
    });

    cartao.appendChild(detalhes);

    // Ações
    const acoes = document.createElement('div');
    acoes.className = 'cartao-acoes';

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => abrirModalEdicao(peca));

    const btnExcluir = document.createElement('button');
    btnExcluir.type = 'button';
    btnExcluir.textContent = 'Excluir';
    btnExcluir.style.backgroundColor = '#c62828';
    btnExcluir.addEventListener('click', () => excluirPeca(peca.id));

    acoes.appendChild(btnEditar);
    acoes.appendChild(btnExcluir);
    cartao.appendChild(acoes);

    // Toggle expansão
    function alternarDetalhes() {
        const expandido = detalhes.hidden;
        detalhes.hidden = !expandido;
        toggle.setAttribute('aria-expanded', expandido);
    }

    // Toggle na seta
    toggle.addEventListener('click', alternarDetalhes);

    // Toggle no header todo (exceto clique no botão toggle)
    cabecalho.addEventListener('click', (e) => {
        if (e.target === toggle || toggle.contains(e.target)) return;
        alternarDetalhes();
    });

    return cartao;
}

function mostrarPecas(lista) {
    if (!listaPecas) return;
    listaPecas.innerHTML = '';

    lista.forEach(peca => {
        const cartao = criarCartaoPeca(peca);
        listaPecas.appendChild(cartao);
    });
}

function getPastaNome(pastaId) {
    if (!pastaId) return null;
    const p = pastas.find(x => x.id === pastaId);
    return p ? p.nome : null;
}

async function excluirPeca(id) {
    if (!confirm('Tem certeza que deseja excluir esta peça?')) return;
    try {
        await refPecas().doc(id).delete();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir');
    }
}

// ========================================
// 9. PASTAS
// ========================================

if (botaoPasta) {
    botaoPasta.addEventListener('click', async () => {
        const nome = prompt('Nome da nova pasta:');
        if (!nome || !nome.trim()) return;
        try {
            await refPastas().add({ nome: nome.trim(), criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        } catch (err) {
            console.error('Erro ao criar pasta:', err);
            alert('Erro ao criar pasta');
        }
    });
}

function mostrarPastas() {
    if (!listaPastas) return;
    listaPastas.innerHTML = '';
    pastas.forEach(pasta => {
        const el = document.createElement('p');
        el.textContent = pasta.nome;
        el.style.cursor = 'pointer';
        el.title = 'Clique para renomear / Excluir com Shift+Click';
        el.addEventListener('click', () => renomearPasta(pasta.id, pasta.nome));
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            excluirPasta(pasta.id);
        });
        listaPastas.appendChild(el);
    });
}

async function renomearPasta(id, nomeAtual) {
    const novo = prompt('Novo nome da pasta:', nomeAtual);
    if (!novo || !novo.trim() || novo.trim() === nomeAtual) return;
    try {
        await refPastas().doc(id).update({ nome: novo.trim() });
    } catch (err) {
        console.error('Erro ao renomear:', err);
        alert('Erro ao renomear');
    }
}

async function excluirPasta(id) {
    if (!confirm('Excluir esta pasta? As peças vinculadas ficarão sem pasta.')) return;
    try {
        await refPastas().doc(id).delete();
    } catch (err) {
        console.error('Erro ao excluir pasta:', err);
        alert('Erro ao excluir pasta');
    }
}

function atualizarOpcoesPastas() {
    if (!seletorPasta) return;
    const valorAtual = seletorPasta.value;
    seletorPasta.innerHTML = '<option value="">Nenhuma pasta</option>';
    pastas.forEach(pasta => {
        const op = document.createElement('option');
        op.value = pasta.id;
        op.textContent = pasta.nome;
        if (pasta.id === valorAtual) op.selected = true;
        seletorPasta.appendChild(op);
    });
}

// ========================================
// 10. CLASSIFICAÇÕES (LOJA / ESTOQUE)
// ========================================

function mostrarClassificacoes(lista) {
    // Limpa todas as listas (páginas específicas + visão geral)
    if (listaLoja) listaLoja.innerHTML = '';
    if (listaEstoque) listaEstoque.innerHTML = '';
    if (listaLojaVisao) listaLojaVisao.innerHTML = '';
    if (listaEstoqueVisao) listaEstoqueVisao.innerHTML = '';

    lista.forEach(peca => {
        const classificacao = (peca.classificacao || 'loja').toLowerCase();

        if (classificacao === 'loja') {
            if (listaLoja) listaLoja.appendChild(criarCartaoPeca(peca));
            if (listaLojaVisao) listaLojaVisao.appendChild(criarCartaoPeca(peca));
        } else if (classificacao === 'estoque') {
            if (listaEstoque) listaEstoque.appendChild(criarCartaoPeca(peca));
            if (listaEstoqueVisao) listaEstoqueVisao.appendChild(criarCartaoPeca(peca));
        }
    });
}

// ========================================
// 11. CATEGORIAS
// ========================================

function mostrarCategorias(lista) {
    if (!listaCategorias) return;
    listaCategorias.innerHTML = '';
    const cats = [...new Set(lista.map(p => p.categoria).filter(c => c && c.trim()))];
    cats.forEach(cat => {
        const el = document.createElement('p');
        el.textContent = cat;
        listaCategorias.appendChild(el);
    });
}

// ========================================
// 12. INDICADORES
// ========================================

function atualizarIndicadores() {
    if (!totalPecas || !pecasAtivas || !pecasInativas) return;
    totalPecas.textContent = pecas.length;
    pecasAtivas.textContent = pecas.filter(p => p.status === 'ativa').length;
    pecasInativas.textContent = pecas.filter(p => p.status === 'inativa').length;
}

// ========================================
// 13. BUSCA
// ========================================

if (busca) {
    busca.addEventListener('input', () => {
        const termo = busca.value.toLowerCase().trim();
        const filtradas = pecas.filter(p =>
            p.nome.toLowerCase().includes(termo) ||
            (p.marca || '').toLowerCase().includes(termo) ||
            (p.categoria || '').toLowerCase().includes(termo) ||
            (p.material || '').toLowerCase().includes(termo) ||
            (p.cor || '').toLowerCase().includes(termo) ||
            (p.tamanho || '').toLowerCase().includes(termo) ||
            (p.tags && Array.isArray(p.tags) && p.tags.some(tag => tag.toLowerCase().includes(termo)))
        );
        // Atualiza todas as listas visíveis
        mostrarPecas(filtradas);
        mostrarClassificacoes(filtradas);
    });
}

// ========================================
// 14. MENU LATERAL
// ========================================

if (botaoMenu) {
    botaoMenu.addEventListener('click', () => {
        app.classList.toggle('menu-fechado');
        const aberto = !app.classList.contains('menu-fechado');
        botaoMenu.setAttribute('aria-expanded', aberto);
    });
}

// ========================================
// 15. ATUALIZAR SISTEMA
// ========================================

function atualizarSistema() {
    mostrarPecas(pecas);
    mostrarPastas();
    atualizarOpcoesPastas();
    atualizarIndicadores();
    mostrarClassificacoes(pecas);
    mostrarCategorias(pecas);
    atualizarTodasTags(); // Atualiza sugestões de tags
}

function limparUI() {
    if (listaPecas) listaPecas.innerHTML = '';
    if (listaPastas) listaPastas.innerHTML = '';
    if (listaLoja) listaLoja.innerHTML = '';
    if (listaEstoque) listaEstoque.innerHTML = '';
    if (listaCategorias) listaCategorias.innerHTML = '';
    if (totalPecas) totalPecas.textContent = '0';
    if (pecasAtivas) pecasAtivas.textContent = '0';
    if (pecasInativas) pecasInativas.textContent = '0';
    if (seletorPasta) atualizarOpcoesPastas();
}

// ========================================
// 16. INICIALIZAÇÃO
// ========================================

// Renderiza histórico de cores ao carregar
renderizarHistoricoCores();

// O resto é controlado pelo onAuthStateChanged