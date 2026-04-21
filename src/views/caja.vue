<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { supabase } from '../lib/supabase'
import Swal from 'sweetalert2'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// --- ESTADOS ---
const movimientos = ref([])
const balanceTotal = ref(0)
const loading = ref(true)
const isSubmitting = ref(false)
const showModal = ref(false)
const showReportModal = ref(false)

// Estados para reporte
const reportRange = ref({
  start: new Date().toISOString().split('T')[0],
  end: new Date().toISOString().split('T')[0]
})
const isGenerating = ref(false)

// Datos de sesión
const activeUserRol = ref(localStorage.getItem('userRol') || 'JUGADOR')
const activeUserId = localStorage.getItem('userId')

// --- LÓGICA DE PRIVILEGIOS ---
const isAdmin = computed(() => activeUserRol.value === 'ADMINISTRADOR')
const canWrite = computed(() => ['ADMINISTRADOR', 'TESORERO', 'SECRETARIO'].includes(activeUserRol.value))

const nuevoMovimiento = ref({
  monto: '',
  motivo: '',
  tipo: 'Ingreso'
})

// --- CARGA DE DATOS ---
const fetchData = async () => {
  if (movimientos.value.length === 0) loading.value = true
  
  try {
    const { data: bal } = await supabase.from('balance').select('total').eq('id', 1).single()
    if (bal) balanceTotal.value = bal.total

    const { data: movs, error: movsError } = await supabase.from('movimientos')
      .select(`*, perfiles:registrado_por (nombre_completo)`)
      .order('fecha_registro', { ascending: false })
    
    if (movsError) throw movsError
    movimientos.value = movs || []
  } catch (err) {
    console.error("Error fetching data:", err.message)
  } finally {
    loading.value = false
  }
}

// --- ACCIONES DE CAJA ---
const registrarMovimiento = async () => {
  if (!nuevoMovimiento.value.monto || !nuevoMovimiento.value.motivo || isSubmitting.value) return
  if (!canWrite.value) return

  isSubmitting.value = true
  try {
    const { error } = await supabase.from('movimientos').insert({
      monto: parseFloat(nuevoMovimiento.value.monto),
      motivo: nuevoMovimiento.value.motivo.toUpperCase(),
      tipo: nuevoMovimiento.value.tipo,
      registrado_por: activeUserId,
      estado: 'APROBADO' // Todo ingresa como aprobado directo
    })

    if (error) throw error

    await fetchData();

    Swal.fire({ 
      title: 'REGISTRADO',
      text: 'El movimiento se reflejó en el balance general.',
      icon: 'success', background: '#020617', color: '#fff',
      timer: 2000, showConfirmButton: false
    })
    showModal.value = false
    resetForm()
  } catch (err) {
    Swal.fire({ title: 'Error', text: err.message, icon: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

const gestionarEdicion = async (mov) => {
  if (!isAdmin.value) return // Doble seguridad frontend

  const { value: formValues } = await Swal.fire({
    title: 'EDITAR REGISTRO',
    html: `
      <div style="text-align: left; font-size: 11px; color: #64748b; margin-bottom: 10px;">MONTO ACTUAL: S/ ${mov.monto}</div>
      <input id="sw-monto" type="number" class="swal2-input" value="${mov.monto}" style="background: #0f172a; color: white; border: 1px solid #1e293b">
      <input id="sw-motivo" type="text" class="swal2-input" value="${mov.motivo}" style="background: #0f172a; color: white; border: 1px solid #1e293b">
    `,
    showCancelButton: true,
    confirmButtonText: 'ACTUALIZAR',
    background: '#020617', color: '#fff',
    preConfirm: () => ({
      monto: document.getElementById('sw-monto').value,
      motivo: document.getElementById('sw-motivo').value.toUpperCase()
    })
  })

  if (formValues) {
    const { error } = await supabase.from('movimientos').update({
      monto: formValues.monto,
      motivo: formValues.motivo
    }).eq('id', mov.id)

    if (error) {
       Swal.fire({ title: 'Error', text: error.message, icon: 'error' })
       return
    }

    await fetchData()
    Swal.fire({ title: 'ACTUALIZADO', icon: 'success', background: '#020617', timer: 1500, showConfirmButton: false })
  }
}

const eliminarMovimiento = async (id) => {
  if (!isAdmin.value) return // Doble seguridad frontend

  const result = await Swal.fire({
    title: '¿ELIMINAR REGISTRO?',
    text: "Esta acción restará o sumará automáticamente al balance.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'SÍ, ELIMINAR',
    background: '#020617', color: '#fff', confirmButtonColor: '#ef4444'
  })

  if (result.isConfirmed) {
    try {
      const { error } = await supabase.from('movimientos').delete().eq('id', id)
      if (error) throw error
      await fetchData()
    } catch (err) {
      Swal.fire({ title: 'Error', text: err.message, icon: 'error' })
    }
  }
}

const resetForm = () => {
  nuevoMovimiento.value = { monto: '', motivo: '', tipo: 'Ingreso' }
}

const generarReportePDF = async () => {
  if (!reportRange.value.start || !reportRange.value.end) return
  
  isGenerating.value = true
  try {
    const { data: movs, error } = await supabase.from('movimientos')
      .select(`*, perfiles:registrado_por (nombre_completo)`)
      .gte('fecha_registro', `${reportRange.value.start}T00:00:00`)
      .lte('fecha_registro', `${reportRange.value.end}T23:59:59`)
      .order('fecha_registro', { ascending: true })

    if (error) throw error
    if (!movs || movs.length === 0) {
      throw new Error('No hay movimientos en el rango de fechas seleccionado.')
    }

    // Configuración PDF profesional
    const doc = new jsPDF()
    const primaryColor = [16, 185, 129] // Emerald 500

    // Header
    doc.setFillColor(2, 6, 23) // Slate 950
    doc.rect(0, 0, 210, 40, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text('F.C. PORTILLO', 15, 20)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('SISTEMA DE GESTIÓN FINANCIERA DIGITAL', 15, 28)
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.setFontSize(14)
    doc.text('REPORTE DE MOVIMIENTOS', 210 - 15, 20, { align: 'right' })
    
    doc.setTextColor(200, 200, 200)
    doc.setFontSize(9)
    doc.text(`Periodo: ${reportRange.value.start} al ${reportRange.value.end}`, 210 - 15, 28, { align: 'right' })

    // Tabla de Movimientos
    const tableData = movs.map(m => [
      new Date(m.fecha_registro).toLocaleDateString('es-PE'),
      m.motivo,
      m.tipo.toUpperCase(),
      `S/ ${parseFloat(m.monto).toFixed(2)}`
    ])

    autoTable(doc, {
      startY: 50,
      head: [['FECHA', 'DESCRIPCIÓN', 'TIPO', 'MONTO']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
      }
    })

    // Totales
    const finalY = (doc).lastAutoTable.finalY + 10
    const totalIngresos = movs.filter(m => m.tipo === 'Ingreso').reduce((acc, curr) => acc + Number(curr.monto), 0)
    const totalEgresos = movs.filter(m => m.tipo === 'Egreso').reduce((acc, curr) => acc + Number(curr.monto), 0)
    const saldoPeriodo = totalIngresos - totalEgresos

    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`Total Ingresos: S/ ${totalIngresos.toFixed(2)}`, 210 - 15, finalY, { align: 'right' })
    doc.text(`Total Egresos: S/ ${totalEgresos.toFixed(2)}`, 210 - 15, finalY + 6, { align: 'right' })
    
    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.text(`SALDO DEL PERIODO: S/ ${saldoPeriodo.toFixed(2)}`, 210 - 15, finalY + 15, { align: 'right' })

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('Generado automáticamente por la plataforma FC Portillo', 105, 285, { align: 'center' })

    doc.save(`Reporte_Portillo_${reportRange.value.start}_${reportRange.value.end}.pdf`)
    showReportModal.value = false

    Swal.fire({
      title: 'PDF GENERADO',
      text: 'Tu reporte profesional está listo para imprimir o compartir.',
      icon: 'success', background: '#020617', color: '#fff'
    })

  } catch (err) {
    Swal.fire({ title: 'Error', text: err.message, icon: 'error', background: '#020617', color: '#fff' })
  } finally {
    isGenerating.value = false
  }
}

const formatFecha = (f) => new Date(f).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

let cajaSubscription = null

onMounted(() => {
  activeUserRol.value = localStorage.getItem('userRol') || 'JUGADOR'
  fetchData()

  cajaSubscription = supabase.channel('caja-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, () => fetchData())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'balance' }, () => fetchData())
    .subscribe()
})

onUnmounted(() => {
  if (cajaSubscription) supabase.removeChannel(cajaSubscription)
})
</script>

<template>
  <div class="min-h-[100dvh] pb-32 p-4 md:p-10 bg-[#020617] text-slate-300 font-sans">
    <div class="max-w-6xl mx-auto space-y-10">
      
      <header class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-8">
        <div class="space-y-4">
          <p class="text-emerald-500 text-[9px] font-black uppercase tracking-[0.5em]">Libro Diario Digital</p>
          <div class="flex flex-col gap-1">
            <p class="text-slate-500 text-xs font-bold uppercase tracking-widest">Balance Total</p>
            <h2 class="text-7xl md:text-9xl font-black italic uppercase tracking-tighter text-white">
              <span class="text-emerald-500/50">S/</span>{{ balanceTotal.toFixed(2) }}
            </h2>
          </div>
        </div>
        
        <div v-if="canWrite" class="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button @click="showReportModal = true" 
            class="bg-white/5 border border-white/10 text-white px-8 py-5 rounded-2xl font-black uppercase text-[11px] hover:bg-white/10 transition-all flex items-center justify-center gap-2">
            <span class="material-symbols-rounded text-lg">description</span>
            Reportes PDF
          </button>
          
          <button @click="showModal = true" 
            class="bg-emerald-500 text-slate-950 px-10 py-5 rounded-2xl font-black uppercase text-[11px] shadow-xl shadow-emerald-500/10 hover:bg-emerald-400 transition-all">
            Nuevo Registro
          </button>
        </div>
      </header>

      <div class="space-y-6">
        <h3 class="text-sm font-black uppercase tracking-[0.2em] text-white italic border-b border-white/5 pb-4">Historial de Movimientos</h3>

        <div class="grid grid-cols-1 gap-4">
          <div v-if="loading" class="py-20 text-center"><div class="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto"></div></div>

          <div v-else v-for="mov in movimientos" :key="mov.id" 
            class="group bg-slate-900/40 border border-white/5 p-6 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-4">
            
            <div class="flex items-center gap-6 w-full md:w-auto">
              <div :class="mov.tipo === 'Ingreso' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'" class="w-14 h-14 rounded-3xl flex items-center justify-center">
                <span class="material-symbols-rounded text-3xl">{{ mov.tipo === 'Ingreso' ? 'south_west' : 'north_east' }}</span>
              </div>
              <div>
                <h4 class="text-white font-black uppercase text-base">{{ mov.motivo }}</h4>
                <p class="text-[10px] text-slate-500 font-bold uppercase mt-1">
                  {{ formatFecha(mov.fecha_registro) }} • Resp: {{ mov.perfiles?.nombre_completo?.split(' ')[0] || 'Sistema' }}
                </p>
              </div>
            </div>

            <div class="flex items-center justify-between w-full md:w-auto md:gap-10">
              <p :class="mov.tipo === 'Ingreso' ? 'text-emerald-400' : 'text-rose-500'" class="text-3xl font-black italic">
                {{ mov.tipo === 'Ingreso' ? '+' : '-' }} S/ {{ mov.monto.toFixed(2) }}
              </p>
              
              <div v-if="isAdmin" class="flex gap-2">
                <button @click="gestionarEdicion(mov)" 
                  class="w-12 h-12 rounded-2xl bg-white/5 hover:text-emerald-500 flex items-center justify-center transition-all">
                  <span class="material-symbols-rounded">edit_note</span>
                </button>
                <button @click="eliminarMovimiento(mov.id)" 
                  class="w-12 h-12 rounded-2xl bg-white/5 hover:text-rose-500 flex items-center justify-center transition-all">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="showModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
        <div class="relative w-full max-w-lg bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
          <h3 class="text-3xl font-black italic uppercase text-white mb-8">Nuevo <span class="text-emerald-500">Movimiento</span></h3>
          
          <div class="space-y-6">
            <div class="flex gap-2 p-1 bg-white/5 rounded-2xl">
              <button @click="nuevoMovimiento.tipo = 'Ingreso'" :class="nuevoMovimiento.tipo === 'Ingreso' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500'" class="flex-1 py-3 rounded-xl font-black uppercase text-[10px] transition-all">Ingreso</button>
              <button @click="nuevoMovimiento.tipo = 'Egreso'" :class="nuevoMovimiento.tipo === 'Egreso' ? 'bg-rose-500 text-white' : 'text-slate-500'" class="flex-1 py-3 rounded-xl font-black uppercase text-[10px] transition-all">Egreso</button>
            </div>

            <div class="space-y-2">
              <label class="text-[10px] text-emerald-500 font-black uppercase tracking-widest ml-2">Monto S/</label>
              <input v-model="nuevoMovimiento.monto" type="number" step="0.01" class="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-2xl text-white outline-none focus:border-emerald-500 transition-all font-black" placeholder="0.00" />
            </div>

            <div class="space-y-2">
              <label class="text-[10px] text-emerald-500 font-black uppercase tracking-widest ml-2">Concepto</label>
              <input v-model="nuevoMovimiento.motivo" type="text" class="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-sm text-white outline-none focus:border-emerald-500 transition-all uppercase font-bold" placeholder="EJ. ARBITRAJE" />
            </div>

            <button @click="registrarMovimiento" :disabled="!nuevoMovimiento.monto || !nuevoMovimiento.motivo || isSubmitting"
              class="w-full bg-emerald-500 text-slate-950 py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-lg disabled:opacity-20 transition-all flex justify-center items-center gap-2">
              <span v-if="isSubmitting" class="animate-spin w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full block"></span>
              {{ isSubmitting ? 'REGISTRANDO...' : 'Registrar en Caja' }}
            </button>
            <button @click="showModal = false" class="w-full text-slate-500 font-bold uppercase text-[9px]">Cancelar</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- MODAL DE REPORTES -->
    <Transition name="fade">
      <div v-if="showReportModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
        <div class="relative w-full max-w-lg bg-slate-950 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
          <header class="mb-8">
            <p class="text-emerald-500 text-[9px] font-black uppercase tracking-[0.4em] mb-2">Generar</p>
            <h3 class="text-3xl font-black italic uppercase text-white">Reporte <span class="text-emerald-500">Financiero</span></h3>
          </header>
          
          <div class="space-y-6">
            <div class="space-y-2">
              <label class="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-2">Fecha de Inicio</label>
              <input v-model="reportRange.start" type="date" class="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-white outline-none focus:border-emerald-500 transition-all font-bold" />
            </div>

            <div class="space-y-2">
              <label class="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-2">Fecha de Fin</label>
              <input v-model="reportRange.end" type="date" class="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-white outline-none focus:border-emerald-500 transition-all font-bold" />
            </div>

            <div class="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-4">
               <span class="material-symbols-rounded text-emerald-500">info</span>
               <p class="text-[10px] text-slate-400 leading-relaxed font-medium">
                 El PDF incluirá todos los movimientos, montos, tipos y descripciones registradas en el periodo seleccionado.
               </p>
            </div>

            <button @click="generarReportePDF" :disabled="isGenerating"
              class="w-full bg-emerald-500 text-slate-950 py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-lg disabled:opacity-20 transition-all flex justify-center items-center gap-2">
              <span v-if="isGenerating" class="animate-spin w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full block"></span>
              {{ isGenerating ? 'GENERANDO ARCHIVO...' : 'Descargar Reporte PDF' }}
            </button>
            <button @click="showReportModal = false" class="w-full text-slate-500 font-bold uppercase text-[9px]">Cerrar</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>