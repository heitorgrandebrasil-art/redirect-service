import { useNavigate } from 'react-router-dom';

export default function Setup2FA() {
  const navigate = useNavigate();
  navigate('/admin/account');
  return null;
}
