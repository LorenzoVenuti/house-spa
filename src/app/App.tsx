import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './AppContext';
import { AppLayout } from './layout';
import { Admin, Calendar, Login, Market, Milli, NfcAction, Today, Tribunal } from './routes';

export function App() { return <BrowserRouter><AppProvider><Routes><Route path="/login" element={<Login />} /><Route element={<AppLayout />}><Route path="/today" element={<Today />} /><Route path="/calendar" element={<Calendar />} /><Route path="/tribunal" element={<Tribunal />} /><Route path="/market" element={<Market />} /><Route path="/milli" element={<Milli />} /><Route path="/admin" element={<Admin />} /><Route path="/t/:token" element={<NfcAction />} /></Route><Route path="*" element={<Navigate to="/today" replace />} /></Routes></AppProvider></BrowserRouter>; }
