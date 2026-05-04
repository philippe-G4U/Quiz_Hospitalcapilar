import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Calendar, Clock, ChevronLeft, ChevronRight, CheckCircle, Loader2 } from 'lucide-react';
import { safeFetch } from '../utils/safeFetch';

const CLINICS = {
  madrid: { name: 'Madrid', address: 'Calle del Moscatelar, Nº11, 28043 Madrid' },
  // pontevedra & murcia disabled for initial pilot — only Madrid
  // pontevedra: { name: 'Pontevedra', address: 'Praza de Barcelos, 6, 36002 Pontevedra' },
  // murcia: { name: 'Murcia', address: 'Paseo de Florencia, Rda. Sur, 13, 30010 Murcia' },
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const BookingCalendar = ({ ubicacion, nombre, email, telefono, contactId, onBooked, onBack, rescheduleFrom, tipoConsulta }) => {
  const clinicKeys = Object.keys(CLINICS);
  const [selectedClinic, setSelectedClinic] = useState(ubicacion || (clinicKeys.length === 1 ? clinicKeys[0] : null));
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Fetch availability when date is selected (with abort on re-fetch)
  const abortRef = useRef(null);
  useEffect(() => {
    if (!selectedDate || !selectedClinic) return;

    // Abort previous request if still in-flight
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchSlots = async () => {
      setLoadingSlots(true);
      setSelectedSlot(null);
      try {
        const res = await safeFetch('/.netlify/functions/koibox-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_availability',
            fecha: selectedDate,
            clinica: selectedClinic,
            tipo_consulta: tipoConsulta || 'diagnostico',
          }),
          signal: controller.signal,
        }, { timeoutMs: 12000, retries: 1, label: 'Koibox-Slots' });
        const data = await res.json();
        if (!controller.signal.aborted) {
          setSlots((data.slots || []).filter(s => s.disponible));
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[Booking] Failed to fetch slots:', err);
          setSlots([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSlots(false);
        }
      }
    };

    fetchSlots();
    return () => controller.abort();
  }, [selectedDate, selectedClinic, tipoConsulta]);

  const handleBook = async () => {
    if (!selectedSlot || !selectedDate || !selectedClinic) return;
    if (booking) return; // Prevent double-booking
    setBooking(true);

    try {
      const payload = {
        action: rescheduleFrom ? 'reschedule_appointment' : 'create_appointment',
        nombre: nombre || '',
        email: email || '',
        movil: telefono || '',
        fecha: selectedDate,
        hora_inicio: selectedSlot.hora_inicio,
        hora_fin: selectedSlot.hora_fin,
        clinica: selectedClinic,
        tipo_consulta: tipoConsulta || 'diagnostico',
        ...(contactId && { ghl_contact_id: contactId }),
        ...(rescheduleFrom && { koibox_id: rescheduleFrom }),
      };
      const res = await safeFetch('/.netlify/functions/koibox-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { timeoutMs: 30000, retries: 0, label: 'Koibox-Book' });
      const data = await res.json();

      if (data.success) {
        setBooked({
          fecha: selectedDate,
          hora: selectedSlot.hora_inicio,
          clinica: CLINICS[selectedClinic]?.name || selectedClinic,
        });
        if (onBooked) onBooked(data);
      } else if (data.error === 'bono_required') {
        // If the user got here via /pago-confirmado we already verified payment server-side.
        // Reaching this branch means a verification mismatch (race or transient GHL failure),
        // not that they actually owe money — tell them to call so we don't gaslight a paid customer.
        const looksPaid = typeof window !== 'undefined' && /\/pago-confirmado/.test(window.location.pathname);
        if (looksPaid) {
          alert('Hubo un error verificando tu pago. Por favor llámanos al 623 457 218 y te ayudamos a agendar tu cita en el momento.');
        } else {
          alert('Para poder agendar tu cita, primero necesitas completar el pago del test capilar.');
        }
      } else if (data.error === 'daily_limit_reached') {
        alert('No quedan huecos disponibles para este día. Por favor selecciona otra fecha.');
        setSelectedSlot(null);
        fetchSlots(selectedDate, selectedClinic);
      } else {
        alert('Error al reservar. Inténtalo de nuevo o llámanos al 623 457 218.');
      }
    } catch (err) {
      console.error('[Booking] Failed:', err);
      alert(err.name === 'AbortError'
        ? 'La conexión ha tardado demasiado. Inténtalo de nuevo o llámanos al 623 457 218.'
        : 'Error de conexión. Inténtalo de nuevo.');
    } finally {
      setBooking(false);
    }
  };

  // Calendar helpers
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => {
    const d = new Date(year, month, 1).getDay();
    return d === 0 ? 6 : d - 1; // Monday = 0
  };

  const isDateSelectable = (year, month, day) => {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    if (d < today) return false;
    if (d > maxDate) return false;
    if (d.getDay() === 0) return false; // Sunday always blocked
    if (d.getDay() === 6 && tipoConsulta !== 'asesoria') return false; // Saturday only for asesoria
    return true;
  };

  const formatDateStr = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const formatDisplayDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${DAY_NAMES[date.getDay()]} ${d} de ${MONTH_NAMES[m - 1]}`;
  };

  // ─── BOOKED SUCCESS ────────────────────────
  if (booked) {
    return (
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-[#4CA994] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <CheckCircle size={40} className="text-white" />
        </div>
        <h3 className="text-2xl font-extrabold text-gray-900 mb-2">
          ¡Cita reservada!
        </h3>
        <p className="text-gray-500 text-sm mb-6">
          Te hemos enviado confirmación a <strong>{email}</strong>
        </p>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-left max-w-sm mx-auto">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-[#4CA994]" />
              <span className="text-gray-800 font-medium">{formatDisplayDate(booked.fecha)}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-[#4CA994]" />
              <span className="text-gray-800 font-medium">{booked.hora}h</span>
            </div>
            <div className="flex items-center gap-3">
              <MapPin size={18} className="text-[#4CA994]" />
              <span className="text-gray-800 font-medium">Hospital Capilar {booked.clinica}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          {tipoConsulta === 'asesoria'
            ? 'Asesoría Capilar · Sesión personalizada 60 min'
            : 'Test Capilar Completo · Analítica + Tricoscopia + Valoración 30 min'}
        </p>
      </div>
    );
  }

  // ─── CLINIC SELECTOR ───────────────────────
  if (!selectedClinic) {
    return (
      <div>
        <h3 className="font-bold text-gray-900 mb-1">Elige tu clínica</h3>
        <p className="text-sm text-gray-500 mb-4">Selecciona dónde quieres tu {tipoConsulta === 'asesoria' ? 'asesoría' : 'test capilar'} presencial.</p>
        <div className="space-y-2">
          {Object.entries(CLINICS).map(([key, clinic]) => (
            <button
              key={key}
              onClick={() => setSelectedClinic(key)}
              className="w-full bg-white hover:bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-[#F0F7F6] rounded-lg flex items-center justify-center shrink-0">
                <MapPin size={20} className="text-[#4CA994]" />
              </div>
              <div>
                <p className="font-bold text-gray-900">{clinic.name}</p>
                <p className="text-xs text-gray-400">{clinic.address}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── DATE & TIME PICKER ────────────────────
  const { year, month } = currentMonth;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const canGoPrev = !(year === today.getFullYear() && month === today.getMonth());
  const canGoNext = !(year === maxDate.getFullYear() && month === maxDate.getMonth());

  return (
    <div>
      {/* Clinic header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-[#4CA994] shrink-0" />
          <div>
            <span className="font-bold text-sm text-gray-900">Hospital Capilar {CLINICS[selectedClinic]?.name}</span>
            {CLINICS[selectedClinic]?.address && (
              <p className="text-xs text-gray-400">{CLINICS[selectedClinic].address}</p>
            )}
          </div>
        </div>
        {Object.keys(CLINICS).length > 1 && (
          <button
            onClick={() => { setSelectedClinic(null); setSelectedDate(null); setSelectedSlot(null); }}
            className="text-xs text-[#4CA994] hover:underline mt-1"
          >
            Cambiar clínica
          </button>
        )}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 shadow-sm">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
              setCurrentMonth(prev);
            }}
            disabled={!canGoPrev}
            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <span className="font-bold text-gray-900">{MONTH_NAMES[month]} {year}</span>
          <button
            onClick={() => {
              const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
              setCurrentMonth(next);
            }}
            disabled={!canGoNext}
            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase py-1">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for offset */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = formatDateStr(year, month, day);
            const selectable = isDateSelectable(year, month, day);
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

            return (
              <button
                key={day}
                onClick={() => selectable && setSelectedDate(dateStr)}
                disabled={!selectable}
                className={`aspect-square rounded-lg text-sm font-medium flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-[#4CA994] text-white font-bold shadow-md'
                    : selectable
                      ? 'hover:bg-[#F0F7F6] text-gray-700'
                      : 'text-gray-300 cursor-not-allowed'
                } ${isToday && !isSelected ? 'ring-2 ring-[#4CA994]/30' : ''}`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div className="mb-4">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Horarios disponibles — {formatDisplayDate(selectedDate)}
          </h4>
          {loadingSlots ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="text-[#4CA994] animate-spin" />
              <span className="text-gray-500 text-sm ml-2">Consultando disponibilidad...</span>
            </div>
          ) : slots.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
              <p className="text-gray-500 text-sm">No hay huecos disponibles este día. Prueba otro día.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot, i) => {
                const isSelected = selectedSlot?.hora_inicio === slot.hora_inicio;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-3 rounded-xl text-sm font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#4CA994] text-white shadow-md'
                        : 'bg-white border border-gray-200 text-gray-700 hover:border-[#4CA994] hover:bg-[#F0F7F6]'
                    }`}
                  >
                    {slot.hora_inicio}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirm button */}
      {selectedSlot && (
        <button
          onClick={handleBook}
          disabled={booking}
          className="w-full bg-[#4CA994] hover:bg-[#3d9480] text-white font-bold text-lg py-4 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {booking ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Reservando...
            </>
          ) : (
            <>
              Confirmar cita — {selectedSlot.hora_inicio}h
              <CheckCircle size={18} />
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default BookingCalendar;
