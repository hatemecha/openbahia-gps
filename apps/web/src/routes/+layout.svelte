<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import '$lib/styles/app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>OpenBahía Transit</title>
  <meta name="description" content="Transporte abierto de Bahía Blanca" />
  <link rel="icon" href={favicon} />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

{@render children()}
