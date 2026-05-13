# 一键部署指南

## 前置条件

- 一台有公网 IP 的服务器（腾讯云/阿里云等）
- 服务器已安装 Node.js
- SSH 密钥文件（可以连接到服务器）

## 快速开始

### 1. 配置部署脚本

编辑 [deploy.sh](file:///Users/sui/Documents/trae_projects/导航网站/deploy.sh) 中的配置：

```bash
SERVER_IP="49.232.164.77"       # 替换为你的服务器 IP
SERVER_USER="ubuntu"             # 服务器用户名
SSH_KEY="/Users/sui/Desktop/lexiujiang.pem"  # SSH 密钥路径
ADMIN_PASSWORD="619166"          # 管理密码
SERVER_PORT="3001"               # 服务端口
```

### 2. 运行部署脚本

```bash
cd /Users/sui/Documents/trae_projects/导航网站
./deploy.sh
```

### 3. 访问网站

部署完成后，访问：`http://你的服务器IP:3001`

## 常用管理命令

登录服务器后，可以使用以下命令：

```bash
# 查看日志
pm2 logs navigation

# 重启服务
pm2 restart navigation

# 停止服务
pm2 stop navigation

# 启动服务
pm2 start navigation

# 查看状态
pm2 status
```

## 服务器环境要求

- Node.js 16+
- PM2（脚本会自动安装）

## 防火墙

如果无法访问，请确保服务器防火墙已开放 3001 端口：

```bash
# Ubuntu/Debian
sudo ufw allow 3001

# CentOS
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```
