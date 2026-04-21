<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { supabase } from '../lib/supabase'

const totalCaja = ref(0)
const loading = ref(true)
const errorDb = ref(false)
const sociosPendientes = ref(0)
const chartBars = ref([])

const userRol = ref(localStorage.getItem('userRol') || 'JUGADOR')
const userName = ref(localStorage.getItem('userName') || 'Usuario')

// ─── ZONA HORARIA PERÚ ────────────────────────────────────────────────
// Retorna un objeto Date representando "ahora" pero con los valores
// de hora/día/mes/año según America/Lima (UTC-5, sin DST)
const nowPeru = () => {
  const now = new Date()
  // Formateamos en Lima y volvemos a construir un Date local equivalente
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(now)
  const get = (t) => parts.find(p => p.type === t).value
  return new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`)
}

// ─── PARTIDOS JUGADOS ─────────────────────────────────────────────────
// Cuenta los domingos desde el 1 de enero del año actual hasta HOY (Perú)
const calcPartidosJugados = () => {
  const hoy = nowPeru()
  const inicioAnio = new Date(hoy.getFullYear(), 0, 1) // 1 enero
  // Avanzar hasta el primer domingo del año
  const primerDomingo = new Date(inicioAnio)
  const diaSemana = primerDomingo.getDay() // 0 = domingo
  if (diaSemana !== 0) {
    primerDomingo.setDate(primerDomingo.getDate() + (7 - diaSemana))
  }
  if (primerDomingo > hoy) return 0
  // Contar cuántos domingos hay entre primerDomingo y hoy (inclusive)
  const diffMs = hoy - primerDomingo
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.floor(diffDias / 7) + 1
}

// ─── PRÓXIMO DOMINGO ──────────────────────────────────────────────────
const calcProximoDomingo = () => {
  const hoy = nowPeru()
  const diaSemana = hoy.getDay() // 0 = domingo
  const diasHasta = diaSemana === 0 ? 7 : 7 - diaSemana // si hoy es domingo, el próximo es en 7 días
  const proximo = new Date(hoy)
  proximo.setDate(hoy.getDate() + diasHasta)
  const dia = proximo.getDate()
  const mes = proximo.toLocaleDateString('es-PE', { month: 'long' })
  return { dia, label: `${dia} de ${mes.charAt(0).toUpperCase() + mes.slice(1)}` }
}

const permissions = computed(() => ({
  manageCaja: ['ADMINISTRADOR', 'TESORERO'].includes(userRol.value),
  viewFinance: true, // Todos los aprobados ven el flujo de ingresos/gastos
  approveMembers: ['ADMINISTRADOR', 'SECRETARIO', 'TESORERO'].includes(userRol.value),
  fullControl: userRol.value === 'ADMINISTRADOR'
}))

const rolConfig = computed(() => {
  const configs = {
    ADMINISTRADOR: {
      label: 'Control Total',
      desc: 'Acceso completo a todos los módulos del sistema.',
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/20',
      dot: 'bg-violet-400'
    },
    TESORERO: {
      label: 'Módulo Financiero',
      desc: 'Gestión de caja, ingresos y egresos del club.',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      dot: 'bg-emerald-400'
    },
    SECRETARIO: {
      label: 'Gestión de Socios',
      desc: 'Validación y administración de miembros registrados.',
      color: 'text-sky-400',
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/20',
      dot: 'bg-sky-400'
    },
    JUGADOR: {
      label: 'Modo Jugador',
      desc: 'Visualización general del estado del club.',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      dot: 'bg-amber-400'
    }
  }
  return configs[userRol.value] || configs.JUGADOR
})

// ─── ESTADÍSTICAS ─────────────────────────────────────────────────────
const sociosActivos = ref('—')
const partidosJugados = ref(calcPartidosJugados())
const proximoDomingo = ref(calcProximoDomingo())

const stats = computed(() => [
  {
    label: 'Socios Activos',
    value: sociosActivos.value,
    icon: 'group',
    trend: 'Miembros vigentes',
    up: null
  },
  {
    label: 'Partidos Jugados',
    value: String(partidosJugados.value),
    icon: 'sports_soccer',
    trend: `Domingos jugados ${new Date().getFullYear()}`,
    up: null
  },
  {
    label: 'Próximo Partido',
    value: String(proximoDomingo.value.dia),
    icon: 'calendar_month',
    trend: proximoDomingo.value.label,
    up: null
  }
])

const procesarGrafico = (movs) => {
  const bars = []
  const hoy = new Date()
  
  for(let i = 5; i >= 0; i--) {
     const targetDate = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
     bars.push({
        mesKey: `${targetDate.getFullYear()}-${targetDate.getMonth()}`,
        mesName: targetDate.toLocaleDateString('es-PE', { month: 'short' }),
        ingresos: 0,
        gastos: 0
     })
  }

  movs.forEach(m => {
     const date = new Date(m.fecha_registro)
     const key = `${date.getFullYear()}-${date.getMonth()}`
     const bar = bars.find(b => b.mesKey === key)
     if (bar) {
        if (m.tipo === 'Ingreso') bar.ingresos += Number(m.monto)
        else bar.gastos += Number(m.monto)
     }
  })

  // Obtener el valor máximo para calcular la altura en porcentaje
  const maxVal = Math.max(...bars.flatMap(b => [b.ingresos, b.gastos]), 1);
  bars.forEach(b => {
     // Altura mínima visual del 2%
     b.inPct = Math.max((b.ingresos / maxVal) * 100, b.ingresos > 0 ? 2 : 0)
     b.outPct = Math.max((b.gastos / maxVal) * 100, b.gastos > 0 ? 2 : 0)
  })

  chartBars.value = bars
}

const fetchDashboard = async () => {
  try {
    loading.value = true

    // Saldo en caja
    const { data: balanceData, error: balanceError } = await supabase
      .from('balance')
      .select('total')
      .eq('id', 1)
      .single()
    if (balanceError) throw balanceError
    totalCaja.value = balanceData.total

    // Socios activos reales
    const { count, error: sociosError } = await supabase
      .from('perfiles')
      .select('id', { count: 'exact', head: true })
      .eq('estado_aprobacion', 'APROBADO')
    if (sociosError) throw sociosError
    sociosActivos.value = String(count ?? 0)

    // Socios pendientes (ALERTA)
    const { count: countPendientes, error: errPend } = await supabase
      .from('perfiles')
      .select('id', { count: 'exact', head: true })
      .eq('estado_aprobacion', 'PENDIENTE')
    if (errPend) throw errPend
    sociosPendientes.value = countPendientes ?? 0

    // Movimientos de los últimos 6 meses para el Gráfico
    if (permissions.value.viewFinance) {
      const seisMesesAtras = new Date()
      seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5)
      seisMesesAtras.setDate(1) // Primer día del mes
      const { data: movs, error: movsError } = await supabase
        .from('movimientos')
        .select('monto, tipo, fecha_registro')
        .gte('fecha_registro', seisMesesAtras.toISOString())
        
      if (movsError) throw movsError
      procesarGrafico(movs || [])
    }

  } catch (e) {
    console.error('Error en dashboard:', e.message)
    errorDb.value = true
  } finally {
    loading.value = false
  }
}

let dashSubscription = null

onMounted(() => {
  fetchDashboard()
  
  // Realtime para Dashboard
  dashSubscription = supabase.channel('dash-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, () => fetchDashboard())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'balance' }, () => fetchDashboard())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, () => fetchDashboard())
    .subscribe()
})

onUnmounted(() => {
  if (dashSubscription) supabase.removeChannel(dashSubscription)
})
</script>

<template>
  <div class="dash-wrapper">
    <div class="max-w-6xl mx-auto space-y-10">

      <!-- HEADER DE BIENVENIDA -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 pt-2">
        <div>
          <p class="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mb-2">Panel Principal</p>
          <h1 class="text-white text-3xl md:text-4xl font-black italic uppercase tracking-tighter leading-none">
            Bienvenido, <span class="text-emerald-400">{{ userName.split(' ')[0] }}</span>
          </h1>
        </div>
        <!-- BADGE DE ROL DINÁMICO -->
        <div :class="['rol-badge', rolConfig.bg, rolConfig.border]">
          <span :class="['w-2 h-2 rounded-full animate-pulse flex-shrink-0', rolConfig.dot]"></span>
          <div>
            <p :class="['text-[9px] font-black uppercase tracking-[0.3em]', rolConfig.color]">{{ userRol }}</p>
            <p class="text-white/60 text-[10px] font-semibold leading-tight mt-0.5">{{ rolConfig.label }}</p>
          </div>
        </div>
      </div>

      <!-- DESCRIPCIÓN DE ROL -->
      <div :class="['rol-info-bar', rolConfig.bg, rolConfig.border]">
        <span :class="['material-symbols-rounded text-xl flex-shrink-0', rolConfig.color]">
          {{ userRol === 'ADMINISTRADOR' ? 'shield_person' : userRol === 'TESORERO' ? 'account_balance' : userRol === 'SECRETARIO' ? 'manage_accounts' : 'sports' }}
        </span>
        <p class="text-slate-400 text-xs leading-relaxed">
          <span :class="['font-black', rolConfig.color]">{{ rolConfig.label }}:</span>
          {{ rolConfig.desc }}
        </p>
      </div>

      <!-- CAJA / ESTADO FINANCIERO — solo para roles financieros -->
      <section v-if="permissions.viewFinance" class="finance-hero">
        <div class="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div class="flex items-center gap-2 mb-3">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <p class="text-emerald-400/70 text-[10px] font-black uppercase tracking-[0.4em]">Saldo en Caja — Actualizado</p>
            </div>
            <div v-if="loading" class="h-14 w-56 bg-white/5 animate-pulse rounded-xl"></div>
            <h2 v-else-if="!errorDb" class="text-white text-5xl md:text-6xl font-black italic tracking-tighter leading-none">
              <span class="text-emerald-400 text-3xl font-black mr-1 not-italic">S/</span>{{ totalCaja.toLocaleString('es-PE', { minimumFractionDigits: 2 }) }}
            </h2>
            <p v-else class="text-red-400 text-xs font-black uppercase tracking-widest">Error al conectar con tesorería</p>
          </div>
          <div class="flex items-center gap-3">
            <router-link to="/caja" class="finance-link-btn">
              <span class="material-symbols-rounded text-base">arrow_forward</span>
              <span>Ver Caja</span>
            </router-link>
          </div>
        </div>
        <span class="material-symbols-rounded finance-bg-icon">payments</span>
      </section>

      <!-- ALERTA DINÁMICA: REGISTROS PENDIENTES -->
      <div v-if="sociosPendientes > 0 && permissions.approveMembers" class="bg-amber-500/10 border border-amber-500/30 rounded-[2rem] p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between shadow-[0_0_30px_rgba(245,158,11,0.05)] gap-6">
         <div class="flex items-center gap-5">
            <div class="w-14 h-14 bg-amber-500/20 text-amber-500 rounded-2xl flex items-center justify-center animate-bounce shadow-lg shadow-amber-500/20">
              <span class="material-symbols-rounded text-3xl">notification_important</span>
            </div>
            <div>
              <h4 class="text-amber-500 font-black uppercase tracking-widest text-sm mb-1">¡Acción Requerida!</h4>
              <p class="text-slate-300 font-bold text-sm">
                Tienes <span class="bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md font-black">{{ sociosPendientes }}</span> registro(s) de Socios esperando aprobación.
              </p>
            </div>
         </div>
         <router-link to="/socios" class="w-full sm:w-auto bg-amber-500 text-slate-950 px-8 py-4 rounded-xl font-black uppercase tracking-widest text-[11px] hover:bg-amber-400 hover:scale-105 transition-all shadow-xl shadow-amber-500/10 text-center flex-shrink-0">
           Ver Pendientes
         </router-link>
      </div>

      <!-- GRÁFICO DE BARRAS: INGRESOS VS GASTOS (6 MESES) -->
      <section v-if="permissions.viewFinance">
        <div class="section-header">
          <h3 class="section-title">Flujo Financiero (Últimos 6 Meses)</h3>
          <div class="divider-line"></div>
        </div>

        <div class="bg-slate-900/50 border border-white/5 rounded-[2rem] p-6 md:p-8">
           <!-- Leyenda -->
           <div class="flex justify-start items-center mb-10">
              <div class="flex gap-6 border border-white/10 px-4 py-2 rounded-full bg-slate-950/50">
                 <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div><span class="text-[10px] text-slate-400 font-black tracking-widest uppercase">Ingresos</span></div>
                 <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div><span class="text-[10px] text-slate-400 font-black tracking-widest uppercase">Gastos</span></div>
              </div>
           </div>

           <!-- Contenedor de Barras Flexibles -->
           <div class="flex justify-between items-end h-56 gap-2 sm:gap-4 md:gap-6 w-full max-w-4xl mx-auto border-b border-white/5 pb-2 relative">
               
               <!-- Línea guía decorativa de fondo -->
               <div class="absolute w-full top-1/2 border-t border-white/5 -z-10"></div>

               <!-- Barras por mes -->
               <div v-for="bar in chartBars" :key="bar.mesKey" class="flex-1 flex flex-col items-center justify-end h-full group relative">
                  
                  <!-- Tooltip (Aparece al hacer hover en el contenedor del mes) -->
                  <div class="absolute bottom-full mb-4 opacity-0 group-hover:opacity-100 transition-all bg-slate-800 border border-white/10 p-3 rounded-2xl text-center z-10 pointer-events-none shadow-2xl scale-95 group-hover:scale-100">
                     <p class="text-white text-xs font-black uppercase border-b border-white/10 pb-1 mb-2">{{ bar.mesName }}</p>
                     <p class="text-emerald-400 font-black text-xs whitespace-nowrap">+ S/ {{bar.ingresos.toFixed(2)}}</p>
                     <p class="text-rose-400 font-black text-xs whitespace-nowrap">- S/ {{bar.gastos.toFixed(2)}}</p>
                  </div>

                  <!-- Las Barras en sí -->
                  <div class="flex items-end justify-center w-full h-[90%] gap-1 md:gap-2">
                     <div class="w-full sm:w-1/2 max-w-[20px] bg-gradient-to-t from-emerald-500/20 to-emerald-500 rounded-t-lg transition-all duration-700 ease-out shadow-[0_0_15px_rgba(16,185,129,0.1)] group-hover:brightness-125" :style="{ height: bar.inPct + '%' }"></div>
                     <div class="w-full sm:w-1/2 max-w-[20px] bg-gradient-to-t from-rose-500/20 to-rose-500 rounded-t-lg transition-all duration-700 ease-out shadow-[0_0_15px_rgba(244,63,94,0.1)] group-hover:brightness-125" :style="{ height: bar.outPct + '%' }"></div>
                  </div>
                  
                  <!-- Etiqueta del Mes -->
                  <span class="text-[10px] sm:text-xs font-black py-2 uppercase text-slate-500 tracking-widest">{{ bar.mesName }}</span>
               </div>
           </div>
        </div>
      </section>

      <!-- ESTADÍSTICAS DEL CLUB -->
      <section>
        <div class="section-header">
          <h3 class="section-title">Estadísticas del Club</h3>
          <div class="divider-line"></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div v-for="(stat, i) in stats" :key="i" class="stat-card">
            <div class="stat-card-inner">
              <div class="flex items-start justify-between mb-4">
                <div class="stat-icon-box">
                  <span class="material-symbols-rounded text-xl">{{ stat.icon }}</span>
                </div>
                <span v-if="stat.up !== null" :class="['trend-badge', stat.up ? 'trend-up' : 'trend-down']">
                  {{ stat.up ? '▲' : '▼' }}
                </span>
              </div>
              <p class="stat-value">{{ stat.value }}</p>
              <p class="stat-label">{{ stat.label }}</p>
              <p class="stat-trend">{{ stat.trend }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ACCESOS RÁPIDOS SEGÚN ROL -->
      <section>
        <div class="section-header">
          <h3 class="section-title">Accesos Rápidos</h3>
          <div class="divider-line"></div>
        </div>

        <div v-if="!permissions.viewFinance && !permissions.approveMembers && !permissions.fullControl"
          class="empty-access-card">
          <span class="material-symbols-rounded text-4xl text-slate-600 mb-3">sports</span>
          <p class="text-slate-400 font-bold text-sm uppercase tracking-widest">Modo Jugador</p>
          <p class="text-slate-600 text-xs mt-1">No tienes módulos administrativos asignados.</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

          <router-link v-if="permissions.viewFinance" to="/caja" class="quick-card group">
            <div class="quick-icon emerald">
              <span class="material-symbols-rounded text-2xl">account_balance_wallet</span>
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="quick-title">Libro Diario</h4>
              <p class="quick-desc text-xs">{{ permissions.manageCaja ? 'Movimientos, arbitrajes y cuotas.' : 'Vista de lectura de movimientos.' }}</p>
            </div>
            <span class="material-symbols-rounded quick-arrow">chevron_right</span>
          </router-link>

          <router-link v-if="permissions.approveMembers" to="/socios" class="quick-card group">
            <div class="quick-icon sky">
              <span class="material-symbols-rounded text-2xl">person_check</span>
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="quick-title">Validar Socios</h4>
              <p class="quick-desc">Auditoría de registros y asignación de roles.</p>
            </div>
            <span class="material-symbols-rounded quick-arrow">chevron_right</span>
          </router-link>

          <div v-if="permissions.fullControl" class="quick-card group cursor-default opacity-80">
            <div class="quick-icon red">
              <span class="material-symbols-rounded text-2xl">admin_panel_settings</span>
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="quick-title">Panel Master</h4>
              <p class="quick-desc">Base de datos, purga de registros y logs.</p>
            </div>
            <span class="material-symbols-rounded quick-arrow text-red-500/50">lock</span>
          </div>

        </div>
      </section>

    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0');
@reference "../assets/main.css";

.dash-wrapper {
  @apply p-6 lg:p-10 min-h-[100dvh] pb-32;
}

/* ROL BADGE */
.rol-badge {
  @apply flex items-center gap-3 px-4 py-3 rounded-2xl border;
}

.rol-info-bar {
  @apply flex items-center gap-4 p-4 rounded-2xl border;
}

/* FINANCE HERO */
.finance-hero {
  @apply relative overflow-hidden p-8 md:p-10 rounded-[2rem]
    bg-gradient-to-br from-slate-900 via-emerald-950/30 to-slate-900
    border border-emerald-500/15;
}

.finance-bg-icon {
  @apply absolute -right-6 -bottom-6 text-[12rem] text-emerald-500/5 pointer-events-none -rotate-12;
}

.finance-link-btn {
  @apply flex items-center gap-2 px-5 py-2.5 rounded-xl
    bg-emerald-500/10 border border-emerald-500/20
    text-emerald-400 text-xs font-black uppercase tracking-widest
    hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300;
}

/* SECTION HEADER */
.section-header {
  @apply flex items-center gap-5 mb-6;
}
.section-title {
  @apply text-white text-base font-black italic uppercase tracking-tighter whitespace-nowrap;
}
.divider-line {
  @apply h-px flex-1 bg-gradient-to-r from-white/10 to-transparent;
}

/* STAT CARDS */
.stat-card {
  @apply relative;
}
.stat-card-inner {
  @apply h-full p-5 rounded-2xl bg-slate-900/60 border border-white/5
    hover:border-white/10 hover:bg-slate-800/50 transition-all duration-300;
}
.stat-icon-box {
  @apply w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400
    flex items-center justify-center;
}
.stat-value {
  @apply text-3xl font-black italic text-white tracking-tighter leading-none mb-1;
}
.stat-label {
  @apply text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1;
}
.stat-trend {
  @apply text-[10px] text-slate-600 font-semibold;
}
.trend-badge {
  @apply text-[9px] font-black px-2 py-0.5 rounded-full;
}
.trend-up { @apply bg-emerald-500/10 text-emerald-400; }
.trend-down { @apply bg-red-500/10 text-red-400; }

/* QUICK CARDS */
.quick-card {
  @apply flex items-center gap-4 p-5 rounded-2xl
    bg-slate-900/50 border border-white/5
    hover:bg-slate-800/60 hover:border-white/10 hover:-translate-y-0.5
    transition-all duration-300 cursor-pointer;
}
.quick-icon {
  @apply w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300;
}
.quick-icon.emerald { @apply bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950; }
.quick-icon.sky { @apply bg-sky-500/10 text-sky-400 group-hover:bg-sky-500 group-hover:text-slate-950; }
.quick-icon.violet { @apply bg-violet-500/10 text-violet-400 group-hover:bg-violet-500 group-hover:text-slate-950; }
.quick-icon.red { @apply bg-red-500/10 text-red-400; }
.quick-title { @apply text-white text-sm font-black italic uppercase tracking-tight; }
.quick-desc { @apply text-slate-500 text-[11px] leading-relaxed mt-0.5; }
.quick-arrow {
  @apply text-slate-600 flex-shrink-0 group-hover:text-white group-hover:translate-x-0.5 transition-all duration-300;
}

/* EMPTY STATE */
.empty-access-card {
  @apply flex flex-col items-center justify-center py-16
    bg-slate-900/30 border border-white/5 rounded-2xl;
}
</style>