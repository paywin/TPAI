import type { Script } from "./types";
export const initial: Script[] = [
  {
    id: "panorama",
    title: "Panorama · Cidade e cultura",
    program: "Panorama — Edição da noite",
    updated: "Hoje, 18:32",
    status: "Pronto",
    blocks: [
      {
        id: "a",
        title: "Abertura",
        duration: "00:30",
        kind: "abertura",
        text: "Boa noite. Está começando o Panorama. Hoje, vamos olhar para as ideias que aproximam a cidade das pessoas.",
      },
      {
        id: "b",
        title: "Cidade em movimento",
        duration: "01:15",
        kind: "reportagem",
        text: "Novas rotas de mobilidade conectam bairros e encurtam distâncias. Nossa equipe foi às ruas ouvir quem faz esse caminho todos os dias.",
      },
      {
        id: "c",
        title: "Cultura no fim de semana",
        duration: "00:55",
        kind: "serviço",
        text: "Neste fim de semana, praças recebem música, cinema e atividades gratuitas. A programação reúne artistas locais e convida toda a família.",
      },
    ],
  },
  {
    id: "conexoes",
    title: "Conexões · Abertura",
    program: "Conexões",
    updated: "Ontem, 16:15",
    status: "Em edição",
    blocks: [
      {
        id: "d",
        title: "Abertura",
        duration: "00:40",
        kind: "abertura",
        text: "Olá! Seja bem-vindo ao Conexões. Hoje vamos conhecer histórias que aproximam pessoas e transformam ideias em realidade.",
      },
      {
        id: "e",
        title: "Encerramento",
        duration: "00:40",
        kind: "encerramento",
        text: "Essas foram as histórias de hoje. Obrigado pela companhia e até o próximo encontro.",
      },
    ],
  },
  {
    id: "entrevista",
    title: "Entrevista · Cultura",
    program: "Entrevista",
    updated: "07 out, 10:00",
    status: "Em edição",
    blocks: Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      title: [
        "Introdução",
        "Apresentação",
        "Primeira pergunta",
        "Conversa",
        "Encerramento",
      ][i],
      duration: "01:12",
      kind: "entrevista",
      text: [
        "Hoje vamos conversar sobre cultura e criatividade.",
        "Recebemos uma pessoa especial para compartilhar suas experiências.",
        "Como começou sua trajetória no mundo da arte?",
        "Vamos conhecer um pouco mais sobre os projetos e desafios.",
        "Muito obrigado por acompanhar nossa entrevista.",
      ][i],
    })),
  },
];
