<script setup>
import { ref, watch, computed } from 'vue'
import { supabase } from '../lib/supabase' 
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import bgStadium from '../assets/bg-stadium.jpg'
import logoClub from '../assets/logo.png' 

const router = useRouter()

// Estados Generales
const isLogin = ref(true)
const email = ref('')
const password = ref('') // Para el Login
const loading = ref(false)
const errorMessage = ref('')

// Estados de Registro
const regApellidos = ref('')
const regNombres = ref('')
const regDni = ref('')

// Estados de Validación de Registro Inteligente
const duplicados = ref({ email: false, dni: false, nombre_completo: false })
const usuarioConfirmoIdentidad = ref(false)

const nombreCombinado = computed(() => `${regApellidos.value} ${regNombres.value}`.trim())

// Validar DNI / Email al vuelo
const verificarDuplicadoSimple = async (campo, valor) => {
  if (!valor || valor.trim().length <= 3) {
    if (campo !== 'nombre_completo') duplicados.value[campo] = false
    return
  }
  const { data } = await supabase.from('perfiles').select(campo).ilike(campo, valor.trim().toUpperCase()).maybeSingle()
  duplicados.value[campo] = !!data
}

// Validar Nombre Inteligente (Full Text Search)
const verificarIdentidadInteligente = async (valor) => {
  if (!valor || valor.trim().length < 4 || usuarioConfirmoIdentidad.value) {
    return
  }

  const palabras = valor.trim().toUpperCase().split(/\s+/).filter(p => p.length > 2)
  if (palabras.length === 0) return
  const searchFilter = palabras.join(' & ')

  const { data, error } = await supabase.from('perfiles').select('nombre_completo').textSearch('nombre_completo', searchFilter).maybeSingle()

  if (!error && data && !usuarioConfirmoIdentidad.value) {
    const result = await Swal.fire({
      title: '¿Ya eres miembro antiguo?',
      html: `Detectamos que un socio llamado <b class="text-emerald-500">${data.nombre_completo}</b> ya está registrado. ¿Eres tú intentando volverte a inscribir?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'SÍ, SOY YO',
      cancelButtonText: 'NO, SOY OTRA PERSONA',
      background: '#020617', color: '#fff', 
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#334155'
    })
    
    if (result.isConfirmed) {
      duplicados.value.nombre_completo = true
      usuarioConfirmoIdentidad.value = true
    }
  }
}

// Watchers
watch(() => email.value, (val) => { if(!isLogin.value) verificarDuplicadoSimple('email', val) })
watch(() => regDni.value, (val) => { if(!isLogin.value) verificarDuplicadoSimple('dni', val) })

let timeoutNombre = null
watch(nombreCombinado, (val) => {
  if (isLogin.value) return
  clearTimeout(timeoutNombre)
  // Quitar confirmación de identidad si el usuario altera el nombre a otra persona
  if (usuarioConfirmoIdentidad.value) {
     usuarioConfirmoIdentidad.value = false
     duplicados.value.nombre_completo = false
  }
  timeoutNombre = setTimeout(() => verificarIdentidadInteligente(val), 800)
})

// Validación del Formulario
const formInvalido = computed(() => {
  return !regApellidos.value || !regNombres.value || !regDni.value || !email.value ||
         duplicados.value.email || duplicados.value.dni || usuarioConfirmoIdentidad.value
})

// ====== LÓGICA DE LOGIN ======
const handleLogin = async () => {
  loading.value = true
  errorMessage.value = ''
  
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (authError) throw authError

    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol, estado_aprobacion, nombre_completo')
      .eq('id', authData.user.id)
      .single()

    if (perfilError) throw new Error('No se encontró el perfil del usuario.')

    if (perfil.estado_aprobacion !== 'APROBADO') {
      await supabase.auth.signOut()
      
      Swal.fire({
        title: 'EN ESPERA',
        text: 'Aún no se te aprobó tu ingreso al sistema. Por favor espera a que la directiva valide tu cuenta.',
        icon: 'info',
        background: '#020617', color: '#fff',
        confirmButtonColor: '#10b981'
      })
      return
    }

    localStorage.setItem('userId', authData.user.id)
    localStorage.setItem('userRol', perfil.rol)
    localStorage.setItem('userName', perfil.nombre_completo)

    router.push('/dashboard')

  } catch (error) {
    if (error.message.includes('Invalid login credentials')) {
      errorMessage.value = 'Correo o contraseña incorrectos.'
    } else {
      errorMessage.value = error.message
    }
  } finally {
    loading.value = false
  }
}

// ====== LÓGICA DE REGISTRO ======
const handleRegister = async () => {
  if (formInvalido.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const nombreCompleto = nombreCombinado.value.toUpperCase()
    // Contraseña automática (Ej. Portillo2026)
    const passGenerada = `Portillo${new Date().getFullYear()}`

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.value,
      password: passGenerada,
      options: {
        data: {
          full_name: nombreCompleto,
        }
      }
    })

    if (authError) throw authError

    if (authData?.user) {
      await supabase.from('perfiles').update({ dni: regDni.value }).eq('id', authData.user.id)
    }

    const cellAdmin = '51941464207' // El administrador puede cambiar esto luego
    const mensajeWsp = encodeURIComponent(`Hola directiva de FC Portillo, me acabo de registrar en el sistema como jugador. Mi nombre es ${nombreCompleto}, por favor apruébenme el acceso.`)
    const urlWhatsapp = `https://wa.me/${cellAdmin}?text=${mensajeWsp}`

    Swal.fire({
      title: '¡REGISTRO EXITOSO!',
      html: `
        <p style="margin-bottom: 20px;">Tu solicitud fue enviada. Aún no se te aprobó el acceso. Comunícate con la directiva.</p>
        <a href="${urlWhatsapp}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;padding:12px 20px;border-radius:12px;font-weight:900;text-decoration:none;font-size:12px;text-transform:uppercase;letter-spacing:1px;box-shadow:0 4px 15px rgba(37, 211, 102, 0.3);">
          <svg style="width:22px;height:22px" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.029 18.88c-1.161 0-2.305-.292-3.318-.844l-3.677.964.984-3.595c-.607-1.052-.927-2.246-.926-3.468.001-3.825 3.113-6.937 6.937-6.937 3.825 0 6.938 3.112 6.938 6.937 0 3.825-3.113 6.938-6.938 6.938z"/></svg> 
          Avisar por WhatsApp
        </a>
      `,
      icon: 'success',
      background: '#020617', color: '#fff',
      confirmButtonColor: '#10b981'
    })

    // Limpiar y volver
    isLogin.value = true
    email.value = ''
    password.value = ''
    regApellidos.value = ''
    regNombres.value = ''
    regDni.value = ''
    duplicados.value = { email: false, dni: false, nombre_completo: false }
    usuarioConfirmoIdentidad.value = false

  } catch (error) {
    if (error.message.includes('User already registered')) {
      errorMessage.value = 'Este correo ya pertenece a un usuario.'
    } else {
      errorMessage.value = error.message
    }
  } finally {
    loading.value = false
  }
}

const switchMode = (mode) => {
  isLogin.value = mode
  errorMessage.value = ''
  // Limpiar estados
  email.value = ''
  password.value = ''
  regApellidos.value = ''
  regNombres.value = ''
  regDni.value = ''
  duplicados.value = { email: false, dni: false, nombre_completo: false }
  usuarioConfirmoIdentidad.value = false
}
</script>

<template>
  <div class="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden font-sans">
    
    <div 
      class="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat scale-105 transition-all duration-1000"
      :style="{ 
        backgroundImage: `url(${bgStadium})`, 
        filter: 'blur(0.2px) brightness(0.35)' 
      }"
    ></div>

    <div class="relative z-10 w-full max-w-[440px] transition-all duration-500 hover:scale-[1.01]">
      
      <div class="bg-slate-950/70 backdrop-blur-lg border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-2xl shadow-black/50">
        
        <div class="text-center mb-10 flex flex-col items-center">
          <div class="w-28 h-28 mb-6 bg-white rounded-full p-1 flex items-center justify-center border-4 border-white/20 shadow-2xl shadow-black/30 transform -rotate-2 hover:rotate-0 transition-all duration-300">
             <img :src="logoClub" alt="Escudo F.C. Portillo" class="w-[92%] h-[92%] object-contain" />
          </div>
          <h1 class="text-3xl font-black text-white tracking-tighter uppercase italic">F.C. Portillo</h1>
          <div class="h-1 w-12 bg-emerald-500 mx-auto mt-2 rounded-full"></div>
          <p class="text-white/80 text-xs mt-3 font-medium uppercase tracking-widest">{{ isLogin ? 'Acceso Privado' : 'Registro de Jugador' }}</p>
        </div>

        <!-- FORMULARIO DE INICIO DE SESIÓN -->
        <form v-if="isLogin" @submit.prevent="handleLogin" class="space-y-6">
          <div class="group">
            <label class="text-[10px] text-emerald-400 uppercase tracking-[0.2em] font-black mb-2 block ml-1">Usuario / Email</label>
            <input 
              v-model="email" 
              type="email" 
              placeholder="Ej: admin@fcportillo.com"
              class="w-full bg-white/10 border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all placeholder:text-white/50"
              required
            >
          </div>

          <div class="group">
            <label class="text-[10px] text-emerald-400 uppercase tracking-[0.2em] font-black mb-2 block ml-1">Contraseña</label>
            <input 
              v-model="password" 
              type="password" 
              placeholder="••••••••"
              class="w-full bg-white/10 border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 transition-all placeholder:text-white/50"
              required
            >
          </div>

          <Transition name="fade">
            <div v-if="errorMessage" class="bg-red-500/20 border border-red-500/30 text-red-200 text-xs p-3 rounded-xl text-center font-bold">
              {{ errorMessage }}
            </div>
          </Transition>

          <button 
            type="submit" 
            :disabled="loading" 
            class="relative w-full group overflow-hidden bg-emerald-500 disabled:bg-slate-700 py-4 rounded-2xl transition-all active:scale-95 shadow-xl shadow-emerald-500/30 font-black tracking-widest uppercase text-slate-950 text-sm"
          >
            {{ loading ? 'VERIFICANDO...' : 'ENTRAR AL CLUB' }}
          </button>

          <p class="text-center text-xs text-white/50 mt-6 font-bold uppercase tracking-wider">
            ¿Eres nuevo jugador? 
            <button @click="switchMode(false)" type="button" class="text-emerald-400 hover:text-emerald-300 transition-colors ml-1 border-b border-emerald-500/30 hover:border-emerald-400">Regístrate AQUÍ</button>
          </p>
        </form>

        <!-- FORMULARIO DE REGISTRO JUGADOR -->
        <form v-else @submit.prevent="handleRegister" class="space-y-4">
          
          <div v-if="usuarioConfirmoIdentidad" class="p-3 bg-red-500/10 border border-red-500/30 rounded-xl mb-4 text-center">
            <p class="text-[10px] text-red-400 font-bold uppercase tracking-widest">⚠️ Registro Bloqueado</p>
            <p class="text-[9px] text-red-300 mt-1">Este nombre ya está registrado en la base de datos oficial. Solicita tu acceso a la directiva.</p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="group">
              <label class="text-[9px] text-emerald-400 uppercase tracking-[0.1em] font-black mb-1.5 block ml-1">Apellidos</label>
              <input v-model="regApellidos" type="text" placeholder="Ej: Perez Ramos" class="w-full bg-white/10 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 uppercase placeholder:text-white/40 placeholder:normal-case" required>
            </div>
            <div class="group">
              <label class="text-[9px] text-emerald-400 uppercase tracking-[0.1em] font-black mb-1.5 block ml-1">Nombres</label>
              <input v-model="regNombres" type="text" placeholder="Ej: Juan" class="w-full bg-white/10 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 uppercase placeholder:text-white/40 placeholder:normal-case" required>
            </div>
          </div>

          <div class="group relative">
            <label class="text-[9px] text-emerald-400 uppercase tracking-[0.1em] font-black mb-1.5 block ml-1 flex justify-between">
              DNI (Documento)
              <span v-if="duplicados.dni" class="text-red-400 text-[8px] animate-pulse">Este DNI ya está en uso</span>
            </label>
            <input v-model="regDni" type="text" maxlength="8" pattern="[0-9]{8}" placeholder="8 dígitos" 
              :class="['w-full bg-white/10 border rounded-xl p-3 text-white text-sm outline-none transition-all placeholder:text-white/40', duplicados.dni ? 'border-red-500/50 focus:ring-2 focus:ring-red-500/20' : 'border-white/10 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15']" required>
          </div>

          <div class="group relative">
            <label class="text-[9px] text-emerald-400 uppercase tracking-[0.1em] font-black mb-1.5 block ml-1 flex justify-between">
              Correo Electrónico
              <span v-if="duplicados.email" class="text-red-400 text-[8px] animate-pulse">Email ya registrado</span>
            </label>
            <input v-model="email" type="email" placeholder="uncorreo@gmail.com" 
              :class="['w-full bg-white/10 border rounded-xl p-3 text-white text-sm outline-none transition-all placeholder:text-white/40', duplicados.email ? 'border-red-500/50 focus:ring-2 focus:ring-red-500/20' : 'border-white/10 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15']" required>
          </div>

          <!-- Ocultamos el campo de contraseña y agregamos una nota -->
          <div class="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <p class="text-[9px] text-emerald-400 font-bold uppercase tracking-widest"><span class="material-symbols-rounded inline align-middle text-[12px] mr-1">lock</span> Contraseña Automática</p>
            <p class="text-[9.5px] text-white/70 italic mt-1 font-medium">No necesitas una, se asignará Portillo2026 clave del club automáticamente.(Cambiaria solo el año segun corresponda)</p>
          </div>

          <Transition name="fade">
            <div v-if="errorMessage" class="bg-red-500/20 border border-red-500/30 text-red-200 text-xs p-3 rounded-xl text-center font-bold mt-2">
              {{ errorMessage }}
            </div>
          </Transition>

          <button 
            type="submit" 
            :disabled="loading || formInvalido" 
            class="relative w-full group overflow-hidden bg-amber-500 disabled:bg-slate-700 py-4 rounded-xl mt-4 transition-all active:scale-95 shadow-xl shadow-amber-500/20 font-black tracking-widest uppercase text-slate-950 text-xs flex justify-center items-center gap-2"
          >
            <span v-if="loading" class="animate-spin w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full block"></span>
            {{ loading ? 'ENVIANDO...' : 'SOLICITAR AFILIACIÓN' }}
          </button>

          <p class="text-center text-xs text-white/50 mt-4 font-bold uppercase tracking-wider">
            ¿Ya tienes cuenta o te equivocaste? 
            <button @click="switchMode(true)" type="button" class="text-emerald-400 hover:text-emerald-300 transition-colors ml-1 border-b border-emerald-500/30 hover:border-emerald-400">Inicia sesión</button>
          </p>
        </form>

      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>