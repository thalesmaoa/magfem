---
layout: home
title: MagFEM
titleTemplate: Documentação

hero:
  name: MagFEM
  text: Elementos finitos magnéticos 2D no navegador
  tagline: CAD paramétrico, malha, solver não linear, transitório e AC com circuito, resultados e scripts. Tudo local, sem instalar nada.
  image:
    src: /logo.svg
    alt: MagFEM
  actions:
    - theme: brand
      text: Primeiro modelo
      link: /guide/first-model
    - theme: alt
      text: Guia
      link: /guide/
    - theme: alt
      text: Abrir o MagFEM ↗
      link: https://thalesmaia.com/tools/magfem-web/

features:
  - icon: 📐
    title: CAD paramétrico
    details: Linhas, arcos e círculos com restrições, cotas ligadas a variáveis, tesoura, offset, espelho e padrões. Importa DXF, SVG e .fem do FEMM.
    link: /guide/geometry
  - icon: 🧲
    title: Magnetostática, AC e transitório
    details: Plano ou axissimétrico, materiais não lineares (curva B-H), ímãs, correntes parasitas e acoplamento forte com circuito externo.
    link: /guide/solver
  - icon: 📊
    title: Resultados
    details: Mapas de campo, linhas de fluxo, gráficos sobre linhas, indutância, força e torque (tensor de Maxwell), perdas e animações.
    link: /guide/results
  - icon: 🐍
    title: Scripts
    details: Cada ação vira um comando do console. A ponte local liga Python, Matlab, Julia ou qualquer linguagem HTTP ao modelo aberto no navegador.
    link: /scripting/bridge
---
