import React from "react";
import "./video-bg.css";

export default function VideoBG({ src, poster, children }) {
  return (
    <div className="vbWrap">
      <video
        className="vbVideo"
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
      />

      <div className="vbOverlay" />

      {/* Animated vectors */}
      <div className="vbVectors">
        <div className="vbBlob" style={{ top: "-220px", left: "-220px" }} />
        <div className="vbBlob two" style={{ bottom: "-200px", right: "-180px" }} />
        <div className="vbRing" />
      </div>

      {/* Floating particles */}
      <div className="vbParticles">
        <span className="vbDot big" style={{ top: "18%", left: "14%", animationDelay: "0.2s" }} />
        <span className="vbDot" style={{ top: "28%", left: "78%", animationDelay: "0.8s" }} />
        <span className="vbDot tiny" style={{ top: "64%", left: "22%", animationDelay: "1.2s" }} />
        <span className="vbDot" style={{ top: "72%", left: "84%", animationDelay: "0.6s" }} />
        <span className="vbDot tiny" style={{ top: "42%", left: "52%", animationDelay: "1.6s" }} />
      </div>

      <div className="vbContent">{children}</div>
    </div>
  );
}
