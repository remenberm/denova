# ============================================================
# 阶段 1: 构建前端
# ============================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /build/web

# 启用 corepack 以使用 pnpm
RUN corepack enable

# 复制前端依赖清单
COPY web/package.json web/pnpm-lock.yaml* ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制前端源码并构建
COPY web/ ./
RUN pnpm build


# ============================================================
# 阶段 2: 构建后端（嵌入前端产物）
# ============================================================
FROM golang:1.26-alpine AS backend-builder

# 安装构建所需工具
RUN apk add --no-cache git bash ripgrep

WORKDIR /build

# 复制 Go 模块文件
COPY go.mod go.sum ./
COPY agent/ ./agent/

# 下载依赖
RUN go mod download

# 复制全部源码
COPY . .

# 将前端构建产物复制到后端嵌入目录
COPY --from=frontend-builder /build/web/dist ./web/dist

# 使用 embedweb 构建标签编译（前端嵌入二进制）
RUN CGO_ENABLED=0 go build -tags embedweb -o /build/denova ./cmd


# ============================================================
# 阶段 3: 运行镜像
# ============================================================
FROM alpine:3.21

# 安装运行时依赖
RUN apk add --no-cache ca-certificates tzdata ripgrep git

# 创建非 root 用户
RUN adduser -D -h /home/denova denova

WORKDIR /home/denova

# 复制编译好的二进制
COPY --from=backend-builder /build/denova /usr/local/bin/denova

# 数据与工作区目录
RUN mkdir -p /home/denova/.denova /home/denova/workspace && \
    chown -R denova:denova /home/denova

USER denova

# 暴露后端服务端口
EXPOSE 8080

# 默认工作区挂载点
VOLUME ["/home/denova/workspace"]

# 启动 Denova
ENTRYPOINT ["denova"]
CMD ["--workspace", "/home/denova/workspace"]
