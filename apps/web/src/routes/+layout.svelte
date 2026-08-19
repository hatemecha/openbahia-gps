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
</svelte:head>

{@render children()}
