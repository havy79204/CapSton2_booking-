import '../styles/Footer.css';
import { useSalonContact } from '../hooks/useHomepage';
import { IoGlobeOutline, IoLogoFacebook, IoLogoInstagram } from 'react-icons/io5';

function normalizeExternalUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const Footer = () => {
  const { contact } = useSalonContact();

  const salonName = 'NIOM&CE';
  const salonEmail = String(contact?.email || '').trim();
  const salonPhone = String(contact?.phone || '').trim();
  const salonAddress = String(contact?.address || '').trim();
  const websiteUrl = normalizeExternalUrl(contact?.website);
  const facebookUrl = normalizeExternalUrl(contact?.facebook || contact?.facebookUrl);
  const instagramUrl = normalizeExternalUrl(contact?.instagram || contact?.instagramUrl);

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
          <p className="footer-description">
            Professional nail care with a clean process, quality products, and a relaxing experience in every visit.
          </p>
        </div>

        <div className="footer-section">
          <h3>Contact</h3>
          <ul className="footer-contact">
            {salonEmail ? <li>{salonEmail}</li> : null}
            {salonPhone ? <li>{salonPhone}</li> : null}
            {addressLines.map((line, idx) => <li key={`addr-${idx}`}>{line}</li>)}
          </ul>
          <p className="footer-note">Support for booking, service consultation, and aftercare guidance.</p>
        </div>

        <div className="footer-section">
          <h3>Connect</h3>
          <div className="social-icons">
            {websiteUrl ? (
              <a href={websiteUrl} className="social-icon website" target="_blank" rel="noreferrer" aria-label="Visit website">
                <IoGlobeOutline />
              </a>
            ) : (
              <span className="social-icon website disabled" aria-hidden="true">
                <IoGlobeOutline />
              </span>
            )}

            {facebookUrl ? (
              <a href={facebookUrl} className="social-icon facebook" target="_blank" rel="noreferrer" aria-label="Visit Facebook">
                <IoLogoFacebook />
              </a>
            ) : (
              <span className="social-icon facebook disabled" aria-hidden="true">
                <IoLogoFacebook />
              </span>
            )}

            {instagramUrl ? (
              <a href={instagramUrl} className="social-icon instagram" target="_blank" rel="noreferrer" aria-label="Visit Instagram">
                <IoLogoInstagram />
              </a>
            ) : (
              <span className="social-icon instagram disabled" aria-hidden="true">
                <IoLogoInstagram />
              </span>
            )}
          </div>
          <p className="footer-note">Follow NIOM&CE for latest designs, offers, and booking updates.</p>
        </div>
      </div>  
    </footer>
  );
};

export default Footer;
