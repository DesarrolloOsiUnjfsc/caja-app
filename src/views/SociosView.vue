<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'

// --- ESTADOS ---
const socios = ref([])
const loading = ref(true)
const isSubmitting = ref(false)
const searchQuery = ref('')
const showModal = ref(false)

// NUEVOS ESTADOS PARA EDICIÓN
const isEditing = ref(false)
const socioIdEditando = ref(null)

const usuarioConfirmoIdentidad = ref(false)
const duplicados = ref({ email: false, dni: false, nombre_completo: false })

const nuevoSocio = ref({
  nombre_completo: '',
  email: '',
  dni: '',
  rol: 'JUGADOR',
  estado_aprobacion: 'PENDIENTE'
})

// --- CONFIGURACIÓN DE ROLES ---
const activeUserRol = localStorage.getItem('userRol') || 'JUGADOR'

// CORRECCIÓN: Los roles disponibles ahora incluyen el rol actual del socio para que el select no cargue vacío
const rolesDisponibles = computed(() => {
  let roles = []
  
  if (activeUserRol === 'ADMINISTRADOR') {
    roles = ['ADMINISTRADOR', 'TESORERO', 'SECRETARIO', 'JUGADOR']
  } else {
    roles = ['JUGADOR']
  }

  // Si estamos editando, forzamos que el rol actual del socio esté en la lista
  // para que el select pueda mostrarlo aunque el usuario actual no tenga permiso de asignarlo
  if (isEditing.value && nuevoSocio.value.rol) {
    if (!roles.includes(nuevoSocio.value.rol)) {
      roles.push(nuevoSocio.value.rol)
    }
  }

  return roles
})

// --- LÓGICA DE BÚSQUEDA INTELIGENTE ---
const verificarIdentidadInteligente = async (valor) => {
  if (isEditing.value || !valor || valor.trim().length < 4) {
    duplicados.value.nombre_completo = false
    usuarioConfirmoIdentidad.value = false
    return
  }

  const palabras = valor.trim().toUpperCase().split(/\s+/).filter(p => p.length > 2)
  if (palabras.length === 0) return
  const searchFilter = palabras.join(' & ')

  const { data, error } = await supabase.from('perfiles').select('nombre_completo').textSearch('nombre_completo', searchFilter).maybeSingle()

  if (!error && data) {
    const result = await Swal.fire({
      title: '¿Socio Detectado?',
      html: `¿Eres tú <b class="text-emerald-500">${data.nombre_completo}</b>?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'SÍ, SOY YO',
      cancelButtonText: 'NO, SOY OTRO',
      background: '#020617', 
      color: '#fff', 
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#334155'
    })
    if (result.isConfirmed) {
      duplicados.value.nombre_completo = true
      usuarioConfirmoIdentidad.value = true
      nuevoSocio.value.nombre_completo = data.nombre_completo
    }
  }
}

const verificarDuplicadoSimple = async (campo, valor) => {
  if (isEditing.value || !valor || valor.trim().length < 3) {
    duplicados.value[campo] = false
    return
  }
  const { data } = await supabase.from('perfiles').select(campo).ilike(campo, valor.trim().toUpperCase()).maybeSingle()
  duplicados.value[campo] = !!data
}

watch(() => nuevoSocio.value.email, (val) => verificarDuplicadoSimple('email', val))
watch(() => nuevoSocio.value.dni, (val) => verificarDuplicadoSimple('dni', val))
let timeoutNombre = null
watch(() => nuevoSocio.value.nombre_completo, (val) => {
  clearTimeout(timeoutNombre); timeoutNombre = setTimeout(() => verificarIdentidadInteligente(val), 800)
})

const formInvalido = computed(() => {
  const s = nuevoSocio.value
  if (isEditing.value) return !s.nombre_completo || !s.email || !s.dni
  return !s.nombre_completo || !s.email || !s.dni || duplicados.value.email || duplicados.value.dni || usuarioConfirmoIdentidad.value
})

// --- ACCIONES CRUD ---
const fetchSocios = async () => {
  loading.value = true
  const { data, error } = await supabase.from('perfiles').select('*').order('fecha_creacion', { ascending: false })
  if (!error) socios.value = data
  loading.value = false
}

const abrirEdicion = (socio) => {
  isEditing.value = true
  socioIdEditando.value = socio.id
  nuevoSocio.value = { ...socio } 
  showModal.value = true
}

const guardarSocio = async () => {
  if (formInvalido.value) return

  // --- PROTECCIÓN DE JERARQUÍA ---
  if (isEditing.value && activeUserRol !== 'ADMINISTRADOR') {
    const socioOriginal = socios.value.find(s => s.id === socioIdEditando.value)
    
    // Si el socio que intentas editar es de alto rango y tú no eres ADMIN
    if (socioOriginal && socioOriginal.rol !== 'JUGADOR') {
      Swal.fire({
        title: 'PRIVILEGIOS INSUFICIENTES',
        text: `Solo el Administrador puede modificar los datos de un ${socioOriginal.rol}.`,
        icon: 'error',
        background: '#020617',
        color: '#fff',
        confirmButtonColor: '#334155'
      })
      return 
    }
  }

  isSubmitting.value = true
  let userId = socioIdEditando.value

  if (!isEditing.value) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: nuevoSocio.value.email.trim().toLowerCase(),
      password: nuevoSocio.value.dni.trim(),
    })
    if (authError) {
      isSubmitting.value = false
      return Swal.fire({ icon: 'error', title: 'Error Auth', text: authError.message, background: '#020617' })
    }
    userId = authData.user.id
  }

  const { error: profileError } = await supabase.from('perfiles').upsert({
    id: userId,
    nombre_completo: nuevoSocio.value.nombre_completo.trim().toUpperCase(),
    email: nuevoSocio.value.email.trim().toUpperCase(),
    dni: nuevoSocio.value.dni.trim().toUpperCase(),
    rol: nuevoSocio.value.rol,
    estado_aprobacion: nuevoSocio.value.estado_aprobacion
  })

  setTimeout(() => {
    isSubmitting.value = false
    if (!profileError) {
      Swal.fire({ icon: 'success', title: isEditing.value ? 'ACTUALIZADO' : 'REGISTRADO', background: '#020617', color: '#fff' })
      showModal.value = false
      resetForm()
    }
  }, 1000)
}

const eliminarSocio = async (id, nombre) => {
  // --- VALIDACIÓN DE PRIVILEGIOS ---
  if (activeUserRol !== 'ADMINISTRADOR') {
    Swal.fire({
      title: 'ACCESO RESTRINGIDO',
      text: 'No tienes privilegios para eliminar miembros. Contacta con el Administrador.',
      icon: 'error',
      background: '#020617',
      color: '#fff',
      confirmButtonColor: '#334155'
    })
    return 
  }

  const result = await Swal.fire({
    title: '¿ELIMINAR SOCIO?',
    text: `Esta acción borrará permanentemente a ${nombre} y su cuenta de acceso.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'SÍ, ELIMINAR',
    background: '#020617',
    color: '#fff',
    confirmButtonColor: '#ef4444'
  })

  if (result.isConfirmed) {
    // Nota: El Trigger en DB se encargará de borrar auth.users
    const { error } = await supabase.from('perfiles').delete().eq('id', id)
    if (!error) Swal.fire({ icon: 'success', title: 'ELIMINADO', background: '#020617' })
  }
}

const cambiarEstadoAprobacion = async (socio) => {
  if (socio.estado_aprobacion === 'APROBADO') return 

  const result = await Swal.fire({
    title: '¿APROBAR SOCIO?',
    html: `Confirmar acceso oficial para:<br><b class="text-emerald-500">${socio.nombre_completo}</b>`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'SÍ, APROBAR',
    cancelButtonText: 'CANCELAR',
    background: '#020617',
    color: '#fff',
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#334155'
  })

  if (result.isConfirmed) {
    isSubmitting.value = true
    const { error } = await supabase
      .from('perfiles')
      .update({ estado_aprobacion: 'APROBADO' })
      .eq('id', socio.id)

    if (!error) {
      Swal.fire({ title: '¡APROBADO!', icon: 'success', timer: 1500, showConfirmButton: false, background: '#020617', color: '#fff' })
    }
    isSubmitting.value = false
  }
}

const resetForm = () => {
  isEditing.value = false
  socioIdEditando.value = null
  nuevoSocio.value = { nombre_completo: '', email: '', dni: '', rol: 'JUGADOR', estado_aprobacion: 'PENDIENTE' }
  duplicados.value = { email: false, dni: false, nombre_completo: false }
  usuarioConfirmoIdentidad.value = false
}

// REALTIME
let realTimeSubscription = null
const setupRealtime = () => {
  realTimeSubscription = supabase.channel('cambios-perfiles').on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, () => fetchSocios()).subscribe()
}

// FILTRADO Y PAGINACIÓN
const filteredSocios = computed(() => {
  return socios.value.filter(s => 
    s.nombre_completo?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    s.dni?.includes(searchQuery.value)
  )
})

const currentPage = ref(1)
const itemsPerPage = 5
const totalPages = computed(() => Math.ceil(filteredSocios.value.length / itemsPerPage) || 1)
const paginatedSocios = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return filteredSocios.value.slice(start, start + itemsPerPage)
})

onMounted(() => { fetchSocios(); setupRealtime(); })
onUnmounted(() => { if (realTimeSubscription) supabase.removeChannel(realTimeSubscription); })
</script>

<template>
  <div class="min-h-screen pb-24 p-4 md:p-10 bg-[#020617] text-slate-300">
    
    <Transition name="fade">
      <div v-if="isSubmitting" class="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md">
        <div class="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
        <p class="text-emerald-500 font-black uppercase tracking-[0.3em] text-[10px]">Escribiendo en base de datos...</p>
      </div>
    </Transition>

    <div class="max-w-6xl mx-auto space-y-10">
      <header class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
        <div class="space-y-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981]"></span>
            <p class="text-emerald-500 text-[9px] font-black uppercase tracking-[0.5em]">F.C. Portillo Management</p>
          </div>
          <h2 class="text-5xl md:text-7xl font-black italic uppercase tracking-tighter text-white leading-none">
            Plantilla <span class="text-emerald-500 text-outline-sm">Oficial</span>
          </h2>
        </div>
        <button @click="resetForm(); showModal = true" class="w-full md:w-auto bg-emerald-500 text-slate-950 px-10 py-5 rounded-2xl font-black uppercase text-[11px] flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-emerald-400">
          <span class="material-symbols-rounded">person_add</span>
          <span>Registrar Miembro</span>
        </button>
      </header>

      <div class="relative group max-w-2xl">
        <span class="material-symbols-rounded absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-emerald-500 transition-colors">search</span>
        <input v-model="searchQuery" @input="currentPage = 1" type="text" placeholder="Filtrar por nombre o identificación..." 
          class="w-full bg-white/[0.02] border border-white/5 rounded-2xl py-5 pl-14 pr-6 text-sm text-white focus:border-emerald-500/30 focus:bg-white/[0.04] outline-none transition-all placeholder:text-slate-700 font-medium" />
      </div>

      <div class="grid grid-cols-1 gap-4">
        <div v-for="socio in paginatedSocios" :key="socio.id" 
          class="group bg-slate-900/40 border border-white/5 p-6 rounded-[2.5rem] hover:bg-slate-800/50 transition-all duration-500 relative overflow-hidden">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div class="flex items-center gap-5">
              <div class="w-14 h-14 rounded-2xl bg-slate-800 border border-white/5 flex items-center justify-center text-emerald-500 font-black text-xl group-hover:bg-emerald-500 group-hover:text-slate-950 transition-all duration-500 uppercase">
                {{ socio.nombre_completo?.charAt(0) }}
              </div>
              <div class="space-y-1">
                <h4 class="text-white font-black italic uppercase text-lg leading-none tracking-tight">{{ socio.nombre_completo }}</h4>
                <div class="flex flex-wrap items-center gap-2 md:gap-3">
                  <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{{ socio.email }}</p>
                  <span class="hidden md:block w-1 h-1 rounded-full bg-slate-700"></span>
                  <p class="text-[10px] text-emerald-500/80 font-black uppercase italic tracking-tighter">{{ socio.rol }}</p>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
              <button 
                @click="cambiarEstadoAprobacion(socio)"
                :disabled="socio.estado_aprobacion === 'APROBADO'"
                :class="[
                  'relative px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border transition-all duration-500 overflow-hidden group/status',
                  socio.estado_aprobacion === 'APROBADO' 
                    ? 'text-emerald-400 bg-emerald-400/5 border-emerald-500/20 cursor-default' 
                    : 'text-amber-500 bg-amber-500/10 border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/20 active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                ]"
              >
                <span v-if="socio.estado_aprobacion === 'PENDIENTE'" 
                  class="absolute inset-0 bg-amber-500/20 animate-ping rounded-full pointer-events-none"></span>
                
                <span class="relative z-10 flex items-center gap-2">
                  <span class="material-symbols-rounded text-[14px]">
                    {{ socio.estado_aprobacion === 'APROBADO' ? 'verified' : 'priority_high' }}
                  </span>
                  {{ socio.estado_aprobacion }}
                </span>
              </button>
              <div class="flex gap-1 border-l border-white/10 pl-4">
                <button @click="abrirEdicion(socio)" class="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:text-white transition-all hover:bg-white/5">
                  <span class="material-symbols-rounded">edit</span>
                </button>
                <button 
                  @click="eliminarSocio(socio.id, socio.nombre_completo)" 
                  :class="[
                    'w-10 h-10 flex items-center justify-center rounded-xl transition-all',
                    activeUserRol === 'ADMINISTRADOR' ? 'text-slate-600 hover:text-red-500 hover:bg-red-500/5' : 'text-slate-800 cursor-not-allowed opacity-30'
                  ]"
                >
                  <span class="material-symbols-rounded">{{ activeUserRol === 'ADMINISTRADOR' ? 'delete' : 'lock' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav v-if="totalPages > 1" class="flex justify-center items-center gap-3 pt-6">
        <button @click="currentPage--" :disabled="currentPage === 1" class="pag-btn"><span class="material-symbols-rounded">west</span></button>
        <div class="flex gap-2">
          <button v-for="p in totalPages" :key="p" @click="currentPage = p" :class="currentPage === p ? 'active-p' : 'inactive-p'">{{ p }}</button>
        </div>
        <button @click="currentPage++" :disabled="currentPage === totalPages" class="pag-btn"><span class="material-symbols-rounded">east</span></button>
      </nav>

      <Transition name="fade">
        <div v-if="showModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" @click="showModal = false"></div>
          
          <div class="relative w-full max-w-2xl bg-slate-950 border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div class="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

            <div class="relative z-10 flex justify-between items-start mb-10">
              <div>
                <h3 class="text-3xl md:text-4xl font-black italic uppercase text-white tracking-tighter">
                  {{ isEditing ? 'Editar' : 'Nuevo' }} <span class="text-emerald-500">Miembro</span>
                </h3>
                <p class="text-xs text-slate-500 mt-2 font-medium uppercase tracking-widest">
                  {{ isEditing ? 'Actualizando datos del socio' : 'Validación de identidad activa' }}
                </p>
              </div>
              <button @click="showModal = false" class="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white transition-all"><span class="material-symbols-rounded">close</span></button>
            </div>

            <div class="relative z-10 space-y-8">
              <div class="space-y-2">
                <label class="text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em] ml-2">Apellidos y Nombres</label>
                <div class="relative group">
                  <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors">badge</span>
                  <input v-model="nuevoSocio.nombre_completo" type="text" 
                    :class="['w-full bg-white/[0.02] border rounded-2xl py-4 pl-12 pr-4 text-white text-sm outline-none transition-all uppercase', usuarioConfirmoIdentidad ? 'border-red-500/50 bg-red-500/5' : 'border-white/5 focus:border-emerald-500/50']" 
                    placeholder="Ej. BONILLA LLAGAS ROBERT ALEXIS" />
                  <div v-if="usuarioConfirmoIdentidad" class="mt-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20"><p class="text-[9px] text-red-500 font-bold uppercase tracking-widest">⚠️ REGISTRO BLOQUEADO: YA ERES MIEMBRO</p></div>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-2">
                  <label class="text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em] ml-2">DNI / Identificación</label>
                  <div class="relative group">
                    <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors">pin</span>
                    <input v-model="nuevoSocio.dni" type="text" :disabled="isEditing"
                      :class="['w-full bg-white/[0.02] border rounded-2xl py-4 pl-12 pr-4 text-white text-sm outline-none transition-all disabled:opacity-40', duplicados.dni ? 'border-red-500/50 bg-red-500/5' : 'border-white/5 focus:border-emerald-500/50']" />
                  </div>
                </div>
                <div class="space-y-2">
                  <label class="text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em] ml-2">Rol Asignado</label>
                  <div class="relative group">
                    <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 transition-colors">
                      {{ (isEditing && nuevoSocio.rol !== 'JUGADOR' && activeUserRol !== 'ADMINISTRADOR') ? 'lock' : 'shield_person' }}
                    </span>
                    
                    <select 
                      v-model="nuevoSocio.rol" 
                      :disabled="activeUserRol !== 'ADMINISTRADOR' && isEditing && nuevoSocio.rol !== 'JUGADOR'"
                      class="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-2xl py-4 pl-12 pr-10 text-emerald-400 text-sm font-bold outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option v-for="rol in rolesDisponibles" :key="rol" :value="rol" class="bg-slate-900">{{ rol }}</option>
                    </select>
                    
                    <span class="material-symbols-rounded absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none">expand_more</span>
                  </div>
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em] ml-2">Correo Institucional</label>
                <div class="relative group">
                  <span class="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400 transition-colors">alternate_email</span>
                  <input v-model="nuevoSocio.email" type="email" :disabled="isEditing"
                    :class="['w-full bg-white/[0.02] border rounded-2xl py-4 pl-12 pr-4 text-white text-sm outline-none transition-all uppercase disabled:opacity-40', duplicados.email ? 'border-red-500/50 bg-red-500/5' : 'border-white/5 focus:border-emerald-500/50']" />
                </div>
              </div>

              <div class="mt-10">
                <button @click="guardarSocio" :disabled="formInvalido" class="w-full bg-emerald-500 text-slate-950 py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-lg disabled:opacity-20 transition-all flex justify-center items-center gap-2">
                  <span class="material-symbols-rounded">{{ isEditing ? 'save' : 'how_to_reg' }}</span>
                  <span>{{ isEditing ? 'Guardar Cambios' : 'Finalizar Alta de Socio' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

    </div>
  </div>
</template>

<style scoped>
@reference "../assets/main.css";
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.pag-btn { @apply w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 text-slate-600 hover:text-white transition-all disabled:opacity-5; }
.active-p { @apply w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 font-black text-[10px]; }
.inactive-p { @apply w-12 h-12 rounded-2xl bg-white/5 text-slate-600 font-black text-[10px] hover:bg-white/10 transition-all; }
.text-outline-sm { -webkit-text-stroke: 1px rgba(255,255,255,0.1); }
</style>