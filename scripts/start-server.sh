#!/bin/bash

#############################################
# FreeSWITCH 后端服务启动脚本
#############################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
gray='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${gray}ℹ ${1}${NC}"
}

print_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

print_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

print_header() {
    echo -e "\n${gray}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${gray}  ${1}${NC}"
    echo -e "${gray}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# 获取脚本所在目录的父目录（项目根目录）
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

print_header "FreeSWITCH 后端服务启动"

# 检查是否在项目根目录
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
    print_error "未找到 package.json，请确保脚本在项目目录中运行"
    exit 1
fi

cd "$PROJECT_ROOT"
print_info "当前工作目录: $PROJECT_ROOT"

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    print_error "Node.js 未安装，请先安装 Node.js"
    exit 1
fi
print_success "Node.js 版本: $(node --version)"

# 检查 pnpm 是否安装
if ! command -v pnpm &> /dev/null; then
    print_warning "pnpm 未安装，尝试使用 npm..."
    if ! command -v npm &> /dev/null; then
        print_error "npm 也未安装，请先安装 Node.js"
        exit 1
    fi
    PKG_MANAGER="npm"
    print_info "使用 npm 作为包管理器"
else
    PKG_MANAGER="pnpm"
    print_success "使用 pnpm 作为包管理器: $(pnpm --version)"
fi

# 检查 .env 文件是否存在
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    print_warning ".env 文件不存在"
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
        print_info "从 .env.example 创建 .env 文件"
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    else
        print_error ".env.example 文件也不存在，请手动创建 .env 文件"
        exit 1
    fi
fi
print_success ".env 配置文件已就绪"

# 检查 node_modules 是否存在
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    print_warning "依赖未安装，正在安装依赖..."
    if [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm install
    else
        npm install
    fi
    print_success "依赖安装完成"
else
    print_success "依赖已安装"
fi

# 生成 Prisma Client（如果需要）
if [ -d "$PROJECT_ROOT/prisma" ]; then
    print_info "检查 Prisma 配置..."
    if [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm prisma generate
    else
        npx prisma generate
    fi
    print_success "Prisma Client 已生成"
fi

# 检查后端入口文件是否存在
if [ ! -f "$PROJECT_ROOT/api/server.ts" ]; then
    print_error "后端入口文件 api/server.ts 不存在"
    exit 1
fi

# 检查端口是否被占用（默认 3001）
PORT=${BACKEND_PORT:-3001}
if command -v lsof &> /dev/null; then
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "端口 $PORT 已被占用"
        read -p "是否继续启动？(y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "已取消启动"
            exit 0
        fi
    fi
fi

# 启动后端服务
print_header "启动后端开发服务器"
print_info "端口: $PORT"
print_info "监控目录: api/"
echo ""

# 使用 npm run server:dev 启动
if [ "$PKG_MANAGER" = "pnpm" ]; then
    pnpm run server:dev
else
    npm run server:dev
fi
