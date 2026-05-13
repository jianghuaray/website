#!/bin/bash
set -e

# 配置区域 - 请根据你的服务器信息修改这些配置
SERVER_IP="49.232.164.77"       # 替换为你的服务器 IP
SERVER_USER="ubuntu"             # 服务器用户名
SSH_KEY="/Users/sui/Desktop/lexiujiang.pem"  # SSH 密钥路径
REMOTE_DIR="/opt/navigation"     # 服务器上的部署目录
ADMIN_PASSWORD="619166"          # 管理密码
SERVER_PORT="3001"               # 服务端口

# 自动配置
SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP}"
SCP_CMD="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

echo "🚀 开始部署导航网站到服务器..."
echo ""

# 检查 SSH 密钥是否存在
if [ ! -f "$SSH_KEY" ]; then
  echo "❌ SSH 密钥文件不存在: $SSH_KEY"
  echo "请修改脚本中的 SSH_KEY 配置"
  exit 1
fi

echo "📦 1/7 打包项目代码..."
cd "$(dirname "$0")"
tar czf /tmp/navigation-deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='server/data.json' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='._*' \
  public server package.json deploy.sh
echo "   打包完成"

echo "🔒 2/7 备份服务器数据..."
$SSH_CMD "cd $REMOTE_DIR 2>/dev/null && \
  if [ -f server/data.json ]; then \
    cp server/data.json /tmp/navigation-data-backup.json ; \
    echo '数据备份完成'; \
  else \
    echo '数据文件不存在，跳过备份'; \
  fi" || true

echo "📤 3/7 上传到服务器..."
$SCP_CMD /tmp/navigation-deploy.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/
echo "   上传完成"

echo "📂 4/7 解压并设置目录..."
$SSH_CMD "sudo mkdir -p $REMOTE_DIR && sudo chown -R $SERVER_USER:$SERVER_USER $REMOTE_DIR && cd $REMOTE_DIR && \
  if [ -f /tmp/navigation-data-backup.json ]; then \
    cp /tmp/navigation-data-backup.json server/data.json 2>/dev/null || true ; \
    echo '数据恢复完成' ; \
  fi && \
  rm -rf public server && \
  tar xzf /tmp/navigation-deploy.tar.gz && \
  echo '解压完成'"

echo "📦 5/7 安装服务器依赖..."
$SSH_CMD "cd $REMOTE_DIR/server && npm install --omit=dev 2>&1 | tail -5"
echo "   依赖安装完成"

echo "🔧 6/7 配置并启动服务..."
$SSH_CMD "cd $REMOTE_DIR && \
  if ! command -v pm2 &> /dev/null; then \
    sudo npm install -g pm2 ; \
    echo 'PM2 安装完成' ; \
  fi && \
  pm2 delete navigation 2>/dev/null || true && \
  PORT=$SERVER_PORT ADMIN_PASSWORD=$ADMIN_PASSWORD JWT_SECRET=nav-site-secret-key pm2 start server/index.js --name navigation"
echo "   服务已启动"

$SSH_CMD "cd $REMOTE_DIR && pm2 save && pm2 startup | tail -3"

echo "✅ 7/7 验证部署..."
sleep 3
HEALTH=$($SSH_CMD "curl -s http://localhost:$SERVER_PORT/api/links || echo 'no-response'")
if [ "$HEALTH" != "no-response" ]; then
  echo "   导航网站运行正常 ✓"
else
  echo "   ⚠️ 服务可能有问题，请检查日志: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'pm2 logs navigation'"
fi

echo ""
echo "🎉 部署完成！"
echo "   访问: http://$SERVER_IP:$SERVER_PORT"
echo "   管理密码: $ADMIN_PASSWORD"
echo ""
echo "📝 常用命令:"
echo "   查看日志: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'pm2 logs navigation'"
echo "   重启服务: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'pm2 restart navigation'"
echo "   停止服务: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'pm2 stop navigation'"
