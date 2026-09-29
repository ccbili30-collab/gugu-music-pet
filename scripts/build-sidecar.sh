#!/bin/bash
# 编译汽水音乐 sidecar（go-music-api）到 sidecar/go-music-api
# 依赖：Go >= 1.25（本机装在 ~/.local/go）
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/go/bin:$PATH"
export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"

SRC=/tmp/go-music-api-build
if [ ! -d "$SRC" ]; then
  git clone --depth 1 https://github.com/guohuiyuan/go-music-api.git "$SRC"
  # 本地补丁：支持 PORT 环境变量 + 只监听 127.0.0.1（避开 8080 冲突）
  python3 - "$SRC" << 'EOF'
import sys
p = sys.argv[1] + '/main.go'
s = open(p).read()
s = s.replace('''	r := router.SetupRouter()

	fmt.Println("Music API Server is running on http://localhost:8080")
	fmt.Println("Swagger API 接口文档请访问: http://localhost:8080/swagger/index.html")
	if err := r.Run(":8080"); err != nil {''',
'''	r := router.SetupRouter()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Println("Music API Server is running on http://localhost:" + port)
	if err := r.Run("127.0.0.1:" + port); err != nil {''')
s = s.replace('import (\n\t"fmt"', 'import (\n\t"fmt"\n\t"os"')
open(p, 'w').write(s)
print('patched main.go')
EOF
fi
cd "$SRC"
go mod tidy
mkdir -p "$(dirname "$0")/../sidecar"
go build -ldflags="-s -w" -o "$(dirname "$0")/../sidecar/go-music-api" .
echo "✓ sidecar/go-music-api"
