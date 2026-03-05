import { useEffect, useState } from "react";
import { getReviews, addReview } from "../lib/api";

function SalonReviews({ salonId }) {
  const [reviews, setReviews] = useState([]);
  const [userName, setUserName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    const data = await getReviews(salonId);
    setReviews(data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    await addReview({
      SalonId: salonId,
      UserName: userName,
      Rating: rating,
      Text: text,
    });

    setUserName("");
    setText("");
    loadReviews();
  };

  return (
    <div>
      <h3>Reviews</h3>

      {reviews.map((r) => (
        <div key={r.ReviewId} style={{ borderBottom: "1px solid #ccc" }}>
          <strong>{r.UserName}</strong> ⭐ {r.Rating}
          <p>{r.Text}</p>
        </div>
      ))}

      <h4>Add Review</h4>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Your name"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
        <input
          type="number"
          min="1"
          max="5"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
        />
        <textarea
          placeholder="Your review"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit">Submit</button>
      </form>
    </div>
  );
}

export default SalonReviews;