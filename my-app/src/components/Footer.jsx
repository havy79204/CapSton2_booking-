import '../styles/Footer.css';
import { useSalonContact } from '../hooks/useHomepage';
import { IoGlobeOutline } from 'react-icons/io5';

const Footer = () => {
  const { contact } = useSalonContact();

  const salonName = String(contact?.name || 'NIOM&CE').trim() || 'NIOM&CE';
  const salonEmail = String(contact?.email || '').trim();
  const salonPhone = String(contact?.phone || '').trim();
  const salonAddress = String(contact?.address || '').trim();
  const rawWebsite = String(contact?.website || '').trim();
  const websiteUrl = rawWebsite
    ? (/^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`)
    : '';

  const addressLines = salonAddress
    ? salonAddress
        .split(/\r?\n|,\s*/)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-section">
          <div className="footer-logo">
            <h2>{salonName}</h2>
          </div>
        </div>

        <div className="footer-section">
          <h3>Menu</h3>
          <ul className="footer-links">
            <li><a href="#home">Home</a></li>
            <li><a href="#salons">Salon</a></li>
            <li><a href="#shop">Shop</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>

        <div className="footer-section">
          <h3>Contact</h3>
          <ul className="footer-contact">
            {salonEmail ? <li>{salonEmail}</li> : null}
            {salonPhone ? <li>{salonPhone}</li> : null}
            {addressLines.map((line, idx) => <li key={`addr-${idx}`}>{line}</li>)}
          </ul>
        </div>

        <div className="footer-section">
          <h3>Social</h3>
          <div className="social-icons">
            {websiteUrl ? (
              <a href={websiteUrl} className="social-icon" target="_blank" rel="noreferrer" aria-label="Visit website">
                <IoGlobeOutline />
              </a>
            ) : (
              <span className="social-icon disabled" aria-hidden="true">
                <IoGlobeOutline />
              </span>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
