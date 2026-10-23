import { Component, type ReactNode } from "react";
export default class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (this.state.failed) return <section style={{padding: 32}} role="alert"><h1>Não foi possível abrir o PULSO</h1><p>Recarregue a página. Para executar localmente, use npm start na raiz do projeto.</p><a href="http://localhost:8787">Abrir localhost:8787</a></section>;
    return this.props.children;
  }
}
