# Estados de acompanhamento

| Estado | Entrada | Comportamento |
|---|---|---|
| MANUAL | Inicialização, comando do operador, desconexão do operador | Transcrições não alteram a posição. Rolagem manual só ocorre se explicitamente iniciada. |
| SEARCHING | Ativar automático, primeira transcrição incompatível, salto aguardando confirmação, falha do reconhecimento | Última posição confiável mantida; animação pausada. |
| READING | Correspondência aceita | Atualiza posição-alvo; a interface anima o deslocamento. |
| SILENCE | VAD sem voz por pelo menos `silenceMs` (650 ms por padrão) | Pausa a animação. Uma pausa menor mantém o estado anterior. |
| IMPROVISING | Duas transcrições diferentes sem correspondência suficiente | Mantém posição. Uma correspondência confiável retoma READING. |

Transcrições vazias e eventos idênticos não contam como evidência adicional. A falta de transcrição enquanto há voz por mais de 2 s entra em SEARCHING; não é rotulada como silêncio. O VAD, e não o texto vazio, determina SILENCE.

Um resultado final tardio pode corrigir o alvo enquanto o VAD indica silêncio, mas não deve reativar a animação. Ao voltar a falar, uma nova correspondência retoma a leitura. Desligar áudio congela o rastreamento; assumir manual tem precedência sobre tarefas de reconhecimento já em andamento.

Limiares atuais: score local ≥ 0,72 com pelo menos duas palavras; salto para mais de 30 palavras adiante ou mais de oito atrás exige score ≥ 0,85, quatro palavras e duas evidências diferentes próximas. Uma repetição idêntica do mesmo evento não confirma um salto. Uma revisão parcial seguida de final pode confirmar. Esses valores são heurísticos e não uma garantia de taxa de erro.
