const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'nav-site-secret-key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '619166';

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data.json');

// 中间件
app.use(cors());
app.use(express.json());

// 确保数据文件存在
function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        const initialData = { links: [] };
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    }
}

// 读取数据
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { links: [] };
    }
}

// 写入数据
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 生成唯一ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 认证中间件
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: '令牌无效或已过期' });
    }
}

// 登录失败次数限制
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 10 * 60 * 1000; // 10分钟

// 获取所有链接（公开）
app.get('/api/links', (req, res) => {
    const data = readData();
    res.json(data.links);
});

// 添加链接（需认证）
app.post('/api/links', authMiddleware, (req, res) => {
    const { name, url, category } = req.body;

    if (!name || !url || !category) {
        return res.status(400).json({ error: '名称、链接和分类为必填项' });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).json({ error: '链接必须以 http:// 或 https:// 开头' });
    }

    const data = readData();
    const newLink = {
        id: generateId(),
        name: name.trim(),
        url: url.trim(),
        category: category.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    data.links.push(newLink);
    writeData(data);

    res.status(201).json(newLink);
});

// 编辑链接（需认证）
app.put('/api/links/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { name, url, category } = req.body;

    const data = readData();
    const linkIndex = data.links.findIndex(l => l.id === id);

    if (linkIndex === -1) {
        return res.status(404).json({ error: '链接不存在' });
    }

    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).json({ error: '链接必须以 http:// 或 https:// 开头' });
    }

    data.links[linkIndex] = {
        ...data.links[linkIndex],
        name: name?.trim() || data.links[linkIndex].name,
        url: url?.trim() || data.links[linkIndex].url,
        category: category?.trim() || data.links[linkIndex].category,
        updatedAt: new Date().toISOString()
    };

    writeData(data);
    res.json(data.links[linkIndex]);
});

// 删除链接（需认证）
app.delete('/api/links/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const data = readData();
    const linkIndex = data.links.findIndex(l => l.id === id);

    if (linkIndex === -1) {
        return res.status(404).json({ error: '链接不存在' });
    }

    data.links.splice(linkIndex, 1);
    writeData(data);

    res.json({ message: '删除成功' });
});

// 登录验证
app.post('/api/auth', (req, res) => {
    const { password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    // 检查是否被锁定
    const attempt = loginAttempts.get(clientIp);
    if (attempt && attempt.count >= MAX_ATTEMPTS) {
        const timeLeft = LOCKOUT_TIME - (Date.now() - attempt.lastAttempt);
        if (timeLeft > 0) {
            return res.status(429).json({
                error: `密码错误次数过多，请 ${Math.ceil(timeLeft / 60000)} 分钟后重试`
            });
        } else {
            loginAttempts.delete(clientIp);
        }
    }

    if (password === ADMIN_PASSWORD) {
        // 登录成功，清除失败记录
        loginAttempts.delete(clientIp);

        const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '30m' });
        res.json({ token, expiresIn: '30m' });
    } else {
        // 登录失败
        const currentAttempt = loginAttempts.get(clientIp) || { count: 0, lastAttempt: Date.now() };
        currentAttempt.count++;
        currentAttempt.lastAttempt = Date.now();
        loginAttempts.set(clientIp, currentAttempt);

        const remainingAttempts = MAX_ATTEMPTS - currentAttempt.count;
        res.status(401).json({
            error: '密码错误',
            remainingAttempts: Math.max(0, remainingAttempts)
        });
    }
});

// 导出配置（需认证）
app.get('/api/export', authMiddleware, (req, res) => {
    const data = readData();
    const exportData = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        links: data.links
    };

    const filename = `nav_backup_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(exportData);
});

// 导入配置（需认证）
const upload = multer({ dest: 'uploads/' });

app.post('/api/import', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: '请上传文件' });
    }

    try {
        const fileContent = fs.readFileSync(req.file.path, 'utf8');
        const importData = JSON.parse(fileContent);

        if (!importData.links || !Array.isArray(importData.links)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: '无效的数据格式' });
        }

        // 验证每个链接的格式
        const validLinks = importData.links.filter(link => {
            return link.id && link.name && link.url && link.category;
        });

        writeData({ links: validLinks });
        fs.unlinkSync(req.file.path);

        res.json({ message: '导入成功', count: validLinks.length });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(400).json({ error: '文件解析失败: ' + error.message });
    }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// 启动服务器
initDataFile();
app.listen(PORT, () => {
    console.log(`导航网站服务器运行在 http://localhost:${PORT}`);
});
