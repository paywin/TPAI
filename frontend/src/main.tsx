import ReactDOM from "react-dom/client";
import ErrorBoundary from "./ErrorBoundary";
import "./index.css";
import("./App").then(({default: App}) => {
  document.getElementById("root")!.dataset.mounted = "true";
  ReactDOM.createRoot(document.getElementById("root")!).render(<ErrorBoundary><App /></ErrorBoundary>);
}).catch(() => {
  document.getElementById("root")!.textContent = "Falha ao carregar a aplicação. Execute npm start na raiz e abra http://localhost:8787. Recarregue a página para buscar a versão atual.";
});
