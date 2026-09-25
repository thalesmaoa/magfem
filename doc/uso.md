# Guia de uso

O MagFEM segue o fluxo **Geometria → Malha → Método de resolução → Resultados**, todos na árvore
à esquerda. Embaixo da árvore ficam as **Propriedades** do item selecionado; à direita, a gaveta
**Problema e bibliotecas** (unidade, plano/axissimétrico, profundidade, materiais, contornos); embaixo,
o **console**, onde cada ação aparece como comando da API.

## 1. Geometria

- Ferramentas na barra superior (ou atalhos: `L` linha, `R` retângulo, `C` círculo, `A` arco,
  `D` cota, `H`/`V` horizontal/vertical, `I` coincidente, `Q` construção).
- Cotas aceitam número, unidade (`2 cm`) ou expressão com variáveis (`Ds/2 - g`). Variáveis em
  Geometria › Variáveis.
- Offset, espelho e padrões são **associativos**: seguem o original quando ele muda.
- Entidades pretas/brancas estão totalmente definidas; azuis ainda têm graus de liberdade.

## 2. Malha

1. **Materiais:** cada região fechada aparece como "Região N" (duplo clique renomeia). Escolha o
   material na lista agrupada; a biblioteca (e a curva B-H) fica na gaveta da direita.
2. **Circuitos:** crie um circuito (corrente em A) e ligue regiões a ele com um número de espiras
   (negativo = sentido de volta).
3. **Contornos:** a borda externa é A = 0 por padrão. Clique nas bordas no desenho (Shift para várias)
   e escolha o contorno (A prescrito, Neumann, periódico, antiperiódico).
4. **Regiões:** tamanho do elemento por região (vazio = automático).
5. **Elementos:** ▶ gera a malha (Triangle). O ângulo mínimo controla a qualidade.

## 3. Método de resolução

▶ em **Campo magnético** resolve (gera a malha antes, se preciso). Mensagens explicam o que falta
(região sem material, falta A prescrito…).

## 4. Resultados

O **+** da física oferece:

| Opção | O que faz |
|---|---|
| Mapa de campo | aba com superfície (B, H, A, J), contorno (A = linhas de fluxo) e glifos (vetores) |
| Mapa interpolado | o mesmo com interpolação de 2º grau e subdivisão (contornos suaves) |
| Gráfico sobre linha | grandeza ao longo de uma curva do desenho, fluxo através dela |
| Resultados (valores) | tabela com integrais sobre linha (Φ, ∫H·dl) e de superfície (corrente, energia…) |
| Circuitos | λ, L = λ/I, R, V e perdas de cada circuito |

Cada vista é uma **aba** no canvas (a aba Desenho continua lá). Camadas podem ser duplicadas,
movidas entre vistas (arrastar na árvore) e ocultadas. Clique na legenda para os limites; arraste-a
para mover e use a alça do canto para redimensionar. **Exportar** gera PNG/JPG da vista, ou
SVG/PNG/CSV das abas de gráfico e tabela.

## Transitório e circuito externo

- Em **Método de resolução**, mude a análise para **Transitória** e informe frequência, passo e tempo final. As fontes
  são senoidais; o aço com curva B-H é resolvido como não linear (Newton-Raphson) a cada passo; condutores sem fonte
  (σ > 0) têm correntes parasitas.
- Nos resultados, a barra superior da vista tem a barra de tempo, ▶ para animar e **Exportar animação (WebM)**.
- **Circuito externo:** o **+** ao lado de **Modelo** cria um circuito (aba com esquemático). Ele já traz um bloco por
  circuito da Malha (bobinas); a barra superior tem fonte de tensão/corrente senoidal, R, L, C e Terra. Clique num terminal
  e depois em outro para ligar. No transitório, as bobinas do esquemático recebem a corrente do circuito (acoplamento
  forte campo–circuito): por exemplo, fonte de tensão no primário e carga no secundário de um transformador. Clique num
  componente para ver i(t) e v(t).

## Automação

O botão `</>` ao lado de **Modelo** mostra o script que recria o projeto exatamente. Ele roda no
console e é a base da API para scripts externos (Python etc.) — veja [api.md](api.md).
