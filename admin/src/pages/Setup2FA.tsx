import { useNavigate } from 'react-router-dom';

export default function Setup2FA() {
  const navigate = useNavigate();
  // This page is a redirect to Settings where 2FA setup happens inline
  navigate('/admin/settings');
  return null;
}
