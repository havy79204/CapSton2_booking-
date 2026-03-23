import '../styles/Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-section">
          <div className="footer-logo">
            <h2>NIOM&CE</h2>
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
            <li>overcurse@Kontact.com</li>
            <li>123 456 7890</li>
            <li>8998 Lorem ipsum,</li>
            <li>Maecenas et, CA, 54321</li>
          </ul>
        </div>

        <div className="footer-section">
          <h3>Social</h3>
          <div className="social-icons">
            <a href="#" className="social-icon">f</a>
            <a href="#" className="social-icon">t</a>
            <a href="#" className="social-icon">in</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
