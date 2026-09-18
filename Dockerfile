# ============================================================
# 阶段 1: 构建前端
# ============================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /build/web

RUN corepack enable

# 复制整个前端目录，避免遗漏 pnpm-workspace.yaml / .npmrc 等配置
COPY web/ ./

RUN pnpm install --frozen-lockfile
RUN pnpm build


# ============================================================
# 阶段 2: 构建后端（嵌入前端产物）
# ============================================================
FROM golang:1.26-alpine AS backend-builder

RUN apk add --no-cache git bash ripgrep

WORKDIR /build

COPY go.mod go.sum ./
COPY agent/ ./agent/

RUN go mod download

COPY . .

# 删除可能存在的旧前端产物（与 scripts/build.sh 保持一致）
RUN rm -rf internal/webfs/dist

# 将前端构建产物复制到后端嵌入目录（关键修正）
# scripts/build.sh 中实际执行的是：cp -r web/dist internal/webfs/dist
COPY --from=frontend-builder /build/web/dist ./internal/webfs/dist

# 自动查找 main 包并编译（前端嵌入二进制）
RUN set -eux; \
    MAIN_PKG=$(go list -f '{{if eq .Name "main"}}{{.ImportPath}}{{end}}' ./... | grep -v '^$' | head -n 1); \
    echo "Building main package: $MAIN_PKG"; \
    test -n "$MAIN_PKG"; \
    CGO_ENABLED=0 go build -tags embedweb -o /build/denova "$MAIN_PKG"


# ============================================================
# 阶段 3: 运行镜像
# ============================================================
FROM alpine:3.21

# 安装运行时依赖（增加 socat 用于端口转发）
RUN apk add --no-cache ca-certificates tzdata ripgrep git socat

# 创建非 root 用户
RUN adduser -D -h /home/denova denova

WORKDIR /home/denova

# 复制编译好的二进制
COPY --from=backend-builder /build/denova /usr/local/bin/denova

# 以 root 身份创建 entrypoint 脚本（必须在 USER denova 之前）
RUN cat > /usr/local/bin/entrypoint.sh <<'EOF'
#!/bin/sh
set -e

INTERNAL_PORT=8081
EXTERNAL_PORT=8080

# 后台启动 socat：0.0.0.0:8080 -> 127.0.0.1:8081
socat TCP-LISTEN:${EXTERNAL_PORT},fork,reuseaddr TCP:127.0.0.1:${INTERNAL_PORT} &

# denova 用 exec 接管 PID 1，正确响应 SIGTERM
exec denova -port "${INTERNAL_PORT}" "$@"
EOF

RUN chmod +x /usr/local/bin/entrypoint.sh

# 数据与工作区目录，并授权给 denova 用户
RUN mkdir -p /home/denova/.denova /home/denova/workspace && \
    chown -R denova:denova /home/denova

USER denova

# 暴露对外端口（socat 监听）
EXPOSE 8080

# 默认工作区挂载点
VOLUME ["/home/denova/workspace"]

# 使用 entrypoint 脚本启动
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["-workspace", "/home/denova/workspace"]
