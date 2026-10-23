# Interface PULSO

React + TypeScript + Vite. Consulte o [README principal](../README.md) para instalar e iniciar o motor Python, reconhecimento local e aplicação Windows.

```powershell
npm ci
npm run dev
npm run build
```

Vite atende somente em loopback, porta 5173, e encaminha `/api` e `/ws` para o motor na porta 8765. A rota `/#presenter` exibe a tela independente. O pacote de produção também pode ser servido pelo backend.
