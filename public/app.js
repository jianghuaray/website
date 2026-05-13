// API 基础地址
const API_BASE = window.location.origin;

// 全局状态
let isAdminMode = false;
let authToken = localStorage.getItem('nav_auth_token');
let links = [];
let currentEditingId = null;
let currentDeletingId = null;
let adminTimeout = null;
let isScrollingToSection = false;

// 分类列表
const CATEGORIES = ['常用', '学习', '工作', '政务', '工具', '其他'];

// 初始化
async function init() {
    await loadLinks();
    renderAllSections();
    setupIntersectionObserver();
    setupModalListeners();

    // 检查 token 是否有效
    if (authToken) {
        // 如果 token 存在，直接进入管理模式（token 过期会在 API 调用时处理）
        enterAdminMode();
    }
}

// 加载链接数据
async function loadLinks() {
    try {
        const response = await fetch(`${API_BASE}/api/links`);
        links = await response.json();
    } catch (error) {
        showToast('加载数据失败');
        links = [];
    }
}

// 获取 favicon URL
function getFaviconUrl(url) {
    try {
        const domain = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
        return null;
    }
}

// 获取首字母
function getInitials(name) {
    return name.charAt(0).toUpperCase();
}

// 渲染所有分类区域
function renderAllSections() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = '';

    CATEGORIES.forEach(category => {
        const categoryLinks = links.filter(link => link.category === category);
        const section = renderSection(category, categoryLinks);
        mainContent.appendChild(section);
    });
}

// 渲染单个分类区域
function renderSection(category, categoryLinks) {
    const section = document.createElement('section');
    section.className = 'section';
    section.id = `section-${category}`;

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `
        <h2 class="section-title">${category}</h2>
        <span class="section-count">${categoryLinks.length} 个链接</span>
        <button class="btn-add" onclick="event.stopPropagation();openAddModal('${category}')">+ 添加</button>
    `;
    header.addEventListener('click', () => {
        section.classList.toggle('collapsed');
    });

    const cardGrid = document.createElement('div');
    cardGrid.className = 'card-grid';

    if (categoryLinks.length === 0) {
        cardGrid.innerHTML = `
            <div class="empty-state">
                <div>暂无链接</div>
            </div>
        `;
    } else {
        categoryLinks.forEach(link => {
            const card = renderCard(link);
            cardGrid.appendChild(card);
        });
    }

    section.appendChild(header);
    section.appendChild(cardGrid);

    return section;
}

// 渲染卡片
function renderCard(link) {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => openLink(link.url);

    const faviconUrl = getFaviconUrl(link.url);
    const iconContent = faviconUrl
        ? `<img src="${faviconUrl}" alt="" onerror="this.parentElement.textContent='${getInitials(link.name)}';this.style.display='none'">`
        : getInitials(link.name);

    card.innerHTML = `
        <div class="card-actions">
            <button class="card-action-btn" onclick="event.stopPropagation();openEditModal('${link.id}')">✏️</button>
            <button class="card-action-btn delete" onclick="event.stopPropagation();openDeleteModal('${link.id}')">🗑️</button>
        </div>
        <div class="card-icon">${iconContent}</div>
        <div class="card-name">${escapeHtml(link.name)}</div>
    `;

    return card;
}

// HTML 转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 打开链接
function openLink(url) {
    window.open(url, '_blank');
}

// 滚动到指定分类
function scrollToSection(category) {
    const section = document.getElementById(`section-${category}`);
    if (section) {
        isScrollingToSection = true;

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.cat === category);
        });

        const targetScrollTop = section.offsetTop - window.innerHeight * 0.25;
        window.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });

        let scrollEndTimer = null;
        const onScroll = () => {
            if (scrollEndTimer) clearTimeout(scrollEndTimer);
            scrollEndTimer = setTimeout(() => {
                isScrollingToSection = false;
                window.removeEventListener('scroll', onScroll);
            }, 100);
        };
        window.addEventListener('scroll', onScroll);
    }
}

// 设置交叉观察器（用于滚动时更新导航高亮）
function setupIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
        if (isScrollingToSection) return;
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const category = entry.target.id.replace('section-', '');
                document.querySelectorAll('.nav-item').forEach(item => {
                    item.classList.toggle('active', item.dataset.cat === category);
                });
            }
        });
    }, { rootMargin: '-20% 0px -60% 0px' });

    document.querySelectorAll('.section').forEach(section => {
        observer.observe(section);
    });
}

// 管理模式切换
function toggleAdminMode() {
    if (isAdminMode) {
        exitAdminMode();
    } else {
        openModal('passwordModal');
        document.getElementById('passwordInput').focus();
    }
}

// 进入管理模式
function enterAdminMode() {
    isAdminMode = true;
    document.body.classList.add('admin-mode');
    document.getElementById('adminBar').classList.add('show');
    showToast('已进入管理模式');

    // 设置30分钟自动退出
    if (adminTimeout) clearTimeout(adminTimeout);
    adminTimeout = setTimeout(() => {
        showToast('管理模式已过期，请重新登录');
        exitAdminMode();
    }, 30 * 60 * 1000);
}

// 退出管理模式
function exitAdminMode() {
    isAdminMode = false;
    authToken = null;
    localStorage.removeItem('nav_auth_token');
    document.body.classList.remove('admin-mode');
    document.getElementById('adminBar').classList.remove('show');
    showToast('已退出管理模式');

    if (adminTimeout) {
        clearTimeout(adminTimeout);
        adminTimeout = null;
    }
}

// 登录
async function doLogin() {
    const password = document.getElementById('passwordInput').value;
    const errorEl = document.getElementById('passwordError');

    if (!password) {
        errorEl.textContent = '请输入密码';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('nav_auth_token', authToken);
            errorEl.textContent = '';
            closeModal('passwordModal');
            document.getElementById('passwordInput').value = '';
            enterAdminMode();
        } else {
            errorEl.textContent = data.error || '密码错误';
            if (data.remainingAttempts !== undefined) {
                errorEl.textContent += `（还剩 ${data.remainingAttempts} 次机会）`;
            }
        }
    } catch (error) {
        errorEl.textContent = '登录失败，请重试';
    }
}

// 打开添加弹窗
function openAddModal(category) {
    currentEditingId = null;
    document.getElementById('linkModalTitle').textContent = '添加链接';
    document.getElementById('linkName').value = '';
    document.getElementById('linkUrl').value = '';
    document.getElementById('linkCategory').value = category;
    openModal('linkModal');
}

// 打开编辑弹窗
function openEditModal(id) {
    const link = links.find(l => l.id === id);
    if (!link) return;

    currentEditingId = id;
    document.getElementById('linkModalTitle').textContent = '编辑链接';
    document.getElementById('linkName').value = link.name;
    document.getElementById('linkUrl').value = link.url;
    document.getElementById('linkCategory').value = link.category;
    openModal('linkModal');
}

// 保存链接
async function saveLink() {
    const name = document.getElementById('linkName').value.trim();
    const url = document.getElementById('linkUrl').value.trim();
    const category = document.getElementById('linkCategory').value;

    if (!name || !url || !category) {
        showToast('请填写必填项');
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showToast('链接必须以 http:// 或 https:// 开头');
        return;
    }

    const linkData = { name, url, category };

    try {
        let response;
        if (currentEditingId) {
            // 编辑
            response = await fetch(`${API_BASE}/api/links/${currentEditingId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(linkData)
            });
        } else {
            // 添加
            response = await fetch(`${API_BASE}/api/links`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(linkData)
            });
        }

        if (response.ok) {
            closeModal('linkModal');
            showToast(currentEditingId ? '已保存' : '已添加');
            await loadLinks();
            renderAllSections();
            setupIntersectionObserver();
        } else if (response.status === 401) {
            showToast('登录已过期，请重新登录');
            exitAdminMode();
        } else {
            const data = await response.json();
            showToast(data.error || '操作失败');
        }
    } catch (error) {
        showToast('操作失败，请重试');
    }
}

// 打开删除弹窗
function openDeleteModal(id) {
    currentDeletingId = id;
    openModal('deleteModal');
}

// 确认删除
async function confirmDelete() {
    if (!currentDeletingId) return;

    try {
        const response = await fetch(`${API_BASE}/api/links/${currentDeletingId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            closeModal('deleteModal');
            showToast('已删除');
            await loadLinks();
            renderAllSections();
            setupIntersectionObserver();
        } else if (response.status === 401) {
            showToast('登录已过期，请重新登录');
            exitAdminMode();
        } else {
            showToast('删除失败');
        }
    } catch (error) {
        showToast('删除失败，请重试');
    }

    currentDeletingId = null;
}

// 导出配置
async function exportConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/export`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nav_backup_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showToast('导出成功');
        } else if (response.status === 401) {
            showToast('登录已过期，请重新登录');
            exitAdminMode();
        } else {
            showToast('导出失败');
        }
    } catch (error) {
        showToast('导出失败，请重试');
    }
}

// 打开导入弹窗
function importConfig() {
    document.getElementById('importFile').value = '';
    openModal('importModal');
}

// 确认导入
async function confirmImport() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];

    if (!file) {
        showToast('请选择文件');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/api/import`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            closeModal('importModal');
            showToast(`导入成功，共 ${data.count} 个链接`);
            await loadLinks();
            renderAllSections();
            setupIntersectionObserver();
        } else if (response.status === 401) {
            showToast('登录已过期，请重新登录');
            exitAdminMode();
        } else {
            const data = await response.json();
            showToast(data.error || '导入失败');
        }
    } catch (error) {
        showToast('导入失败，请重试');
    }
}

// 弹窗控制
function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

// 设置弹窗事件监听
function setupModalListeners() {
    // 点击弹窗外部关闭
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('show');
            }
        });
    });

    // 密码输入框回车提交
    document.getElementById('passwordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    // 链接表单回车提交
    document.getElementById('linkUrl').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveLink();
    });
}

// Toast 提示
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);
