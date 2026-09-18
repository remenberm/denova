# ============================================================
# 阶段 1: 构建前端
# ============================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /build/web

# 启用 corepack 以使用 pnpm
RUN corepack enable

# 直接复制整个前端目录，避免遗漏 pnpm-workspace.yaml / .npmrc 等配置
COPY web/ ./

# 安装依赖（保持 lockfile 校验）
RUN pnpm install --frozen-lockfile

# 构建前端
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

# 将前端构建产物复制到后端嵌入目录
COPY --from=frontend-builder /build/web/dist ./web/dist

# 使用 embedweb 构建标签编译（前端嵌入二进制）
RUN CGO_ENABLED=0 go build -tags embedweb -o /build/denova ./cmd


# ============================================================
# 阶段 3: 运行镜像
# ============================================================
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata ripgrep git

RUN adduser -D -h /home/denova denova

WORKDIR /home/denova

COPY --from=backend-builder /build/denova /usr/local/bin/denova

RUN mkdir -p /home/denova/.denova /home/denova/workspace && \
    chown -R denova:denova /home/denova

USER denova

EXPOSE 8080

VOLUME ["/home/denova/workspace"]

ENTRYPOINT ["denova"]
CMD ["--workspace", "/home/denova/workspace"]
